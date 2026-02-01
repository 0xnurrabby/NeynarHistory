import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, sql } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    await ensureSchema();

    const { fid, track } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const fidNum = Number(fid);
    if (!Number.isFinite(fidNum) || fidNum <= 0) return res.status(400).json({ error: 'Invalid fid' });

    if (track) {
      await sql`INSERT INTO tracked_fids (fid) VALUES (${fidNum}) ON CONFLICT (fid) DO NOTHING`;
      return res.status(200).json({ tracked: true });
    }

    await sql`DELETE FROM tracked_fids WHERE fid=${fidNum}`;
    return res.status(200).json({ tracked: false });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Server error' });
  }
}
