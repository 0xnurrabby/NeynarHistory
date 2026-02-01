import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, redisEnabled } from '../_redis'

type Snapshot = { fid: number; score: number; captured_at: string; source: 'api' }

function snapKey(fid: number) {
  return `nh:snapshots:v1:${fid}`
}

function dedupeAppend(existing: Snapshot[], next: Snapshot, dedupeMinutes = 30) {
  const sorted = existing.slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
  const last = sorted[sorted.length - 1]
  if (last) {
    const minutes = Math.abs(Date.parse(next.captured_at) - Date.parse(last.captured_at)) / 60000
    if (minutes <= dedupeMinutes) {
      sorted[sorted.length - 1] = next
      return sorted
    }
  }
  sorted.push(next)
  return sorted
}

async function fetchNeynarScore(fid: number) {
  const key = process.env.NEYNAR_API_KEY
  if (!key) throw new Error('NEYNAR_API_KEY missing')

  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`
  const r = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': key,
      'x-neynar-experimental': 'true',
    },
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Neynar error (${r.status}): ${txt.slice(0, 140)}`)
  }

  const json: any = await r.json()
  const user = Array.isArray(json?.users) ? json.users[0] : null
  const raw = user?.experimental?.neynar_user_score
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null

  // Score is expected to be 0..1 in this app.
  const score = Math.max(0, Math.min(1, n))
  return score
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!redisEnabled()) {
    res.status(200).json({ enabled: false, reason: 'Upstash Redis not configured' })
    return
  }

  const tracked = (((await redis.get('nh:tracked:v1')) as number[] | null) ?? [])
    .filter((x) => typeof x === 'number' && x > 0)
    .slice(0, 200)

  const results: Array<{ fid: number; ok: boolean; reason?: string }> = []
  for (const fid of tracked) {
    try {
      const score = await fetchNeynarScore(fid)
      if (score == null) {
        results.push({ fid, ok: false, reason: 'No score' })
        continue
      }
      const next: Snapshot = { fid, score, captured_at: new Date().toISOString(), source: 'api' }
      const existing = (((await redis.get(snapKey(fid))) as Snapshot[] | null) ?? []).slice()
      const updated = dedupeAppend(existing, next)
      await redis.set(snapKey(fid), updated)
      results.push({ fid, ok: true })
    } catch (e: any) {
      results.push({ fid, ok: false, reason: e?.message ?? 'error' })
    }
  }

  res.status(200).json({ enabled: true, tracked: tracked.length, results })
}
