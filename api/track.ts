import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, redisSafe } from './_redis'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const fid = Number(body?.fid)
  const track = Boolean(body?.track)

  if (!Number.isFinite(fid) || fid <= 0) {
    res.status(400).json({ error: 'Invalid fid' })
    return
  }

  const out = await redisSafe(async () => {
    const key = 'nh:tracked:v1'
    const current = (((await redis.get(key)) as number[] | null) ?? []).filter((x) => typeof x === 'number' && x > 0)
    const next = track ? Array.from(new Set([...current, fid])).slice(0, 200) : current.filter((x) => x !== fid)
    await redis.set(key, next)
    return next
  })

  if (!out.ok) {
    res.status(200).json({ enabled: false, reason: out.error })
    return
  }

  res.status(200).json({ enabled: true, tracked: out.value })
}
