import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, redisEnabled, redisSafe } from '../_redis'

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

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function pickScore(u: any): number | null {
  const s1 = u?.experimental?.neynar_user_score
  if (typeof s1 === 'number' && Number.isFinite(s1)) return clamp01(s1)
  const s2 = u?.score
  if (typeof s2 === 'number' && Number.isFinite(s2)) {
    if (s2 >= 0 && s2 <= 1) return clamp01(s2)
    if (s2 > 1 && s2 <= 1_000_000) return clamp01(s2 / 1_000_000)
  }
  return null
}

async function fetchBulkScores(fids: number[], viewer_fid?: number) {
  const key = process.env.NEYNAR_API_KEY
  if (!key) throw new Error('NEYNAR_API_KEY not configured')

  const url = new URL('https://api.neynar.com/v2/farcaster/user/bulk')
  url.searchParams.set('fids', fids.join(','))
  if (viewer_fid && viewer_fid > 0) url.searchParams.set('viewer_fid', String(viewer_fid))

  const r = await fetch(url.toString(), {
    headers: {
      'x-api-key': key,
      'x-neynar-experimental': 'true',
    },
  })
  if (!r.ok) throw new Error(`Neynar error ${r.status}`)

  const json = await r.json()
  const users: any[] = json?.users ?? []
  const out = new Map<number, number>()
  for (const u of users) {
    const fid = Number(u?.fid)
    const score = pickScore(u)
    if (Number.isFinite(fid) && fid > 0 && score != null) out.set(fid, score)
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!redisEnabled()) {
    res.status(200).json({ enabled: false, reason: 'Redis not configured' })
    return
  }

  const out = await redisSafe(async () => {
    const tracked = ((await redis().get<number[]>('nh:tracked:v1')) ?? [])
      .filter((x) => typeof x === 'number' && x > 0)
      .slice(0, 200)

    const results: Array<{ fid: number; ok: boolean; reason?: string }> = []
    const now = new Date().toISOString()

    // Neynar bulk endpoint supports up to 100 fids.
    for (let i = 0; i < tracked.length; i += 100) {
      const batch = tracked.slice(i, i + 100)
      let scores: Map<number, number> = new Map()
      try {
        scores = await fetchBulkScores(batch)
      } catch (e: any) {
        for (const fid of batch) results.push({ fid, ok: false, reason: e?.message ?? 'Fetch failed' })
        continue
      }

      for (const fid of batch) {
        const score = scores.get(fid)
        if (score == null) {
          results.push({ fid, ok: false, reason: 'Score unavailable' })
          continue
        }
        const next: Snapshot = { fid, score, captured_at: now, source: 'api' }
        const existing = ((await redis().get<Snapshot[]>(snapKey(fid))) ?? []).slice()
        const merged = dedupeAppend(existing, next)
        await redis().set(snapKey(fid), merged)
        results.push({ fid, ok: true })
      }
    }

    return { trackedCount: tracked.length, results }
  })

  if (!out.ok) {
    res.status(200).json({ enabled: false, reason: out.error })
    return
  }

  res.status(200).json({ enabled: true, ...out.value })
}
