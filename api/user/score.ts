import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, sql } from '../_lib/db';
import { neynarFetch } from '../_lib/neynar';
import { MAX_HISTORY_DAYS, SNAPSHOT_DEDUP_HOURS } from '../_lib/constants';

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();

    const fid = Number(req.query.fid);
    const days = Number(req.query.days ?? 7);
    if (!Number.isFinite(fid) || fid <= 0) return res.status(400).json({ error: 'Invalid fid' });
    const range = days === 30 ? 30 : days === 90 ? 90 : 7;

    // mark as recently viewed
    await sql`INSERT INTO recent_views (fid, last_viewed_at) VALUES (${fid}, NOW())
      ON CONFLICT (fid) DO UPDATE SET last_viewed_at=EXCLUDED.last_viewed_at`;

    // fetch user + score from Neynar
    const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;
    const data = await neynarFetch<any>(neynarUrl);
    const user = data?.users?.[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rawScore = user?.experimental?.neynar_user_score;
    const score = clamp01(Number(rawScore));

    // dedup + write snapshot (on-demand)
    const last = await sql`SELECT score, captured_at FROM score_snapshots WHERE fid=${fid} ORDER BY captured_at DESC LIMIT 1`;
    const now = Date.now();
    const lastAt = last.rows[0]?.captured_at ? new Date(last.rows[0].captured_at).getTime() : 0;
    const lastScore = last.rows[0]?.score != null ? Number(last.rows[0].score) : null;
    const shouldWrite = !lastAt || now - lastAt > hoursToMs(SNAPSHOT_DEDUP_HOURS) || (lastScore != null && Math.abs(lastScore - score) > 1e-9);
    if (shouldWrite) {
      await sql`INSERT INTO score_snapshots (fid, score, captured_at) VALUES (${fid}, ${score}, NOW())`;
    }

    // history (max 90 days stored, client can request 7/30/90)
    const cutoff = new Date(Date.now() - daysToMs(MAX_HISTORY_DAYS)).toISOString();
    const rows = await sql`SELECT fid, score, captured_at FROM score_snapshots WHERE fid=${fid} AND captured_at >= ${cutoff} ORDER BY captured_at ASC`;

    const history = rows.rows.map((r: any) => ({
      fid: Number(r.fid),
      score: clamp01(Number(r.score)),
      captured_at: new Date(r.captured_at).toISOString()
    }));

    // slice to requested range
    const rangeCutoff = new Date(Date.now() - daysToMs(range)).getTime();
    const ranged = history.filter((h) => new Date(h.captured_at).getTime() >= rangeCutoff);
    const begins = history.length ? history[0].captured_at : undefined;

    return res.status(200).json({
      user: {
        fid: Number(user.fid),
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url
      },
      current: {
        score,
        fetched_at: new Date().toISOString()
      },
      history: ranged,
      historyBeginsAt: begins
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Server error' });
  }
}
