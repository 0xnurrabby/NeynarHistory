import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, redisEnabled } from './_redis'

type Snapshot = {
  fid: number
  score: number
  captured_at: string
  source: 'api'
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const fid = Number(req.query.fid)
  if (!Number.isFinite(fid) || fid <= 0) {
    res.status(400).json({ error: 'Invalid fid' })
    return
  }

  const apiKey = process.env.NEYNAR_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'NEYNAR_API_KEY missing' })
    return
  }

  // Fetch user + experimental Neynar score
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`
  const r = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': apiKey,
      'x-neynar-experimental': 'true',
    },
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    res.status(502).json({ error: `Neynar error (${r.status})`, detail: txt.slice(0, 300) })
    return
  }

  const json: any = await r.json()
  const user = Array.isArray(json?.users) ? json.users[0] : null
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const raw = user?.experimental?.neynar_user_score
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(num)) {
    res.status(502).json({ error: 'Score unavailable' })
    return
  }

  // This product treats score as 0..1.
  const score = Math.max(0, Math.min(1, num))
  const captured_at = new Date().toISOString()

  const snap: Snapshot = { fid, score, captured_at, source: 'api' }

  // Store snapshot server-side (optional but strongly recommended)
  if (redisEnabled()) {
    try {
      const existing = (((await redis.get(snapKey(fid))) as Snapshot[] | null) ?? []).slice()
      const updated = dedupeAppend(existing, snap)
      await redis.set(snapKey(fid), updated)
    } catch {
      // don't fail the request if storage is temporarily down
    }
  }

  res.status(200).json({
    snapshot: snap,
    user: {
      fid: Number(user.fid),
      username: typeof user.username === 'string' ? user.username : null,
      display_name: typeof user.display_name === 'string' ? user.display_name : null,
      pfp_url: typeof user.pfp_url === 'string' ? user.pfp_url : null,
    },
  })
}
