import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, sql } from '../_lib/db';
import { neynarFetch } from '../_lib/neynar';
import { SNAPSHOT_DEDUP_HOURS } from '../_lib/constants';

function hoursToMs(h: number) {
  return h * 60 * 60 * 1000;
}

async function fetchBulk(fids: number[]) {
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids.join(',')}`;
  const data = await neynarFetch<any>(url);
  const users: any[] = data?.users ?? [];
  return users.map((u) => ({ fid: Number(u.fid), score: u?.experimental?.neynar_user_score }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Optional shared secret (recommended) for Vercel Cron
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const got = String(req.headers['x-cron-secret'] ?? '');
      if (got !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }

    await ensureSchema();

    // tracked + recently viewed
    const tracked = await sql`SELECT fid FROM tracked_fids ORDER BY tracked_at DESC LIMIT 200`;
    const recent = await sql`SELECT fid FROM recent_views ORDER BY last_viewed_at DESC LIMIT 200`;
    const fids = Array.from(new Set([...tracked.rows, ...recent.rows].map((r: any) => Number(r.fid))))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 300);

    if (fids.length === 0) return res.status(200).json({ ok: true, snapped: 0 });

    // chunk
    let snapped = 0;
    for (let i = 0; i < fids.length; i += 100) {
      const chunk = fids.slice(i, i + 100);
      const scored = await fetchBulk(chunk);
      for (const item of scored) {
        if (typeof item.score !== 'number') continue;
        const last = await sql`SELECT score, captured_at FROM score_snapshots WHERE fid=${item.fid} ORDER BY captured_at DESC LIMIT 1`;
        const now = Date.now();
        const lastAt = last.rows[0]?.captured_at ? new Date(last.rows[0].captured_at).getTime() : 0;
        const lastScore = last.rows[0]?.score != null ? Number(last.rows[0].score) : null;
        const shouldWrite = !lastAt || now - lastAt > hoursToMs(SNAPSHOT_DEDUP_HOURS) || (lastScore != null && Math.abs(lastScore - item.score) > 1e-9);
        if (shouldWrite) {
          await sql`INSERT INTO score_snapshots (fid, score, captured_at) VALUES (${item.fid}, ${item.score}, NOW())`;
          snapped++;
        }
      }
    }

    return res.status(200).json({ ok: true, snapped });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Server error' });
  }
}
