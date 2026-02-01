import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const name = typeof req.query.name === 'string' ? req.query.name.replace(/^@/, '').trim().toLowerCase() : null
  const fid = typeof req.query.fid === 'string' ? Number(req.query.fid) : null

  if (!name && (!fid || !Number.isFinite(fid) || fid <= 0)) {
    res.status(400).json({ error: 'Provide ?name=<handle> or ?fid=<fid>' })
    return
  }

  try {
    const url = name
      ? `https://fnames.farcaster.xyz/transfers?name=${encodeURIComponent(name)}`
      : `https://fnames.farcaster.xyz/transfers?fid=${encodeURIComponent(String(fid))}`

    const r = await fetch(url, { headers: { accept: 'application/json' } })
    if (!r.ok) {
      res.status(502).json({ error: 'FName server error' })
      return
    }
    const json = await r.json()
    const transfers = Array.isArray(json?.transfers) ? json.transfers : []
    if (!transfers.length) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const latest = transfers[transfers.length - 1]
    if (name) {
      if (typeof latest?.to !== 'number' || latest.to <= 0) {
        res.status(404).json({ error: 'Unregistered handle' })
        return
      }
      res.status(200).json({ fid: latest.to, handle: '@' + String(latest.username ?? name) })
      return
    }

    // fid -> handle (only if latest transfer still owned by fid)
    const latestTo = Number(latest?.to)
    const latestName = typeof latest?.username === 'string' ? latest.username : null
    if (latestTo !== fid || !latestName) {
      res.status(200).json({ fid, handle: null })
      return
    }
    res.status(200).json({ fid, handle: '@' + latestName })
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Resolve error' })
  }
}
