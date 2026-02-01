import type { VercelRequest, VercelResponse } from '@vercel/node'

type NeynarUser = {
  fid: number
  username?: string
  display_name?: string
  pfp_url?: string
  experimental?: { neynar_user_score?: number }
  score?: number
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function pickScore(u: NeynarUser): number | null {
  const s1 = u.experimental?.neynar_user_score
  if (typeof s1 === 'number' && Number.isFinite(s1)) return clamp01(s1)
  // Some objects may include score directly.
  const s2 = u.score
  if (typeof s2 === 'number' && Number.isFinite(s2)) {
    // If it is already in [0,1], keep. If it looks like scaled integer, normalize.
    if (s2 >= 0 && s2 <= 1) return clamp01(s2)
    if (s2 > 1 && s2 <= 1_000_000) return clamp01(s2 / 1_000_000)
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const fid = Number(req.query.fid)
  const viewer_fid = req.query.viewer_fid ? Number(req.query.viewer_fid) : undefined
  if (!Number.isFinite(fid) || fid <= 0) {
    res.status(400).json({ error: 'Invalid fid' })
    return
  }

  const key = process.env.NEYNAR_API_KEY
  if (!key) {
    res.status(200).json({ ok: false, reason: 'NEYNAR_API_KEY not configured' })
    return
  }

  const url = new URL('https://api.neynar.com/v2/farcaster/user/bulk')
  url.searchParams.set('fids', String(fid))
  if (viewer_fid && Number.isFinite(viewer_fid) && viewer_fid > 0) url.searchParams.set('viewer_fid', String(viewer_fid))

  try {
    const r = await fetch(url.toString(), {
      headers: {
        'x-api-key': key,
        'x-neynar-experimental': 'true',
      },
    })

    if (!r.ok) {
      const text = await r.text()
      res.status(200).json({ ok: false, reason: `Neynar error (${r.status})`, detail: text.slice(0, 200) })
      return
    }

    const json = (await r.json()) as { users?: NeynarUser[] }
    const u = json?.users?.[0]
    if (!u) {
      res.status(200).json({ ok: false, reason: 'User not found' })
      return
    }

    const score = pickScore(u)
    if (score == null) {
      res.status(200).json({
        ok: false,
        reason: 'Score unavailable',
        user: {
          fid: u.fid,
          username: u.username,
          displayName: u.display_name,
          pfpUrl: u.pfp_url,
        },
      })
      return
    }

    res.status(200).json({
      ok: true,
      user: {
        fid: u.fid,
        username: u.username,
        displayName: u.display_name,
        pfpUrl: u.pfp_url,
      },
      score,
      fetched_at: new Date().toISOString(),
      source: 'api',
    })
  } catch (e: any) {
    res.status(200).json({ ok: false, reason: e?.message ?? 'Fetch failed' })
  }
}
