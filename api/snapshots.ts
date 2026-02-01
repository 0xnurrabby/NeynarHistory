import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, redisSafe } from './_redis'

type Snapshot = {
  fid: number
  score: number
  captured_at: string
  source: 'onchain' | 'api'
}

function key(fid: number) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const fid = Number(req.query.fid)
    const days = Number(req.query.days ?? 90)
    if (!Number.isFinite(fid) || fid <= 0) {
      res.status(400).json({ error: 'Invalid fid' })
      return
    }

    const out = await redisSafe(async () => {
      const snapshots = (((await redis.get(key(fid))) as Snapshot[] | null) ?? []).slice()
      const cutoff = Date.now() - Math.max(1, Math.min(90, days)) * 24 * 60 * 60 * 1000
      return snapshots.filter((s) => Date.parse(s.captured_at) >= cutoff)
    })

    if (!out.ok) {
      res.status(200).json({ enabled: false, snapshots: [], reason: out.error })
      return
    }

    res.status(200).json({ enabled: true, snapshots: out.value })
    return
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const snap: Snapshot = body

    if (!snap || typeof snap.fid !== 'number' || typeof snap.score !== 'number' || typeof snap.captured_at !== 'string') {
      res.status(400).json({ error: 'Invalid snapshot body' })
      return
    }
    if (snap.score < 0 || snap.score > 1) {
      res.status(400).json({ error: 'Score must be 0..1' })
      return
    }

    const out = await redisSafe(async () => {
      const existing = (((await redis.get(key(snap.fid))) as Snapshot[] | null) ?? []).slice()
      const next = dedupeAppend(existing, snap)
      await redis.set(key(snap.fid), next)
      return next
    })

    if (!out.ok) {
      res.status(200).json({ enabled: false, error: out.error })
      return
    }

    res.status(200).json({ enabled: true, snapshots: out.value })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
