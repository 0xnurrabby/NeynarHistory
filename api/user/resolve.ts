import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neynarFetch } from '../_lib/neynar';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const q = String((req.query.q ?? req.query.username ?? '')).trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const isFid = /^\d+$/.test(q);
    if (isFid) return res.status(200).json({ fid: Number(q) });

    const handle = q.startsWith('@') ? q.slice(1) : q;
    if (!/^[a-zA-Z0-9_\-\.]{2,32}$/.test(handle)) {
      return res.status(400).json({ error: 'Invalid handle format' });
    }

    const url = `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(handle)}`;
    const data = await neynarFetch<any>(url);
    const fid = data?.user?.fid;
    if (!fid) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json({ fid: Number(fid) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Server error' });
  }
}
