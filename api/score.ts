import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv, kvEnabled } from "./_kv";

type Snapshot = { fid: number; score: number; captured_at: string; source: "api" };

const SNAP_KEY = (fid: number) => `nh:snapshots:v1:${fid}`;
const TRACKED_KEY = "tracked:fids";
const MAX_SNAPSHOTS = 2000; // plenty for 90d

function normalizeScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  // Neynar onchain/offchain often returns integer scaled by 1e6 (e.g. 950000).
  if (n > 1) return Math.max(0, Math.min(1, n / 1_000_000));
  return Math.max(0, Math.min(1, n));
}

async function fetchNeynarScore(fid: number): Promise<number | null> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return null;

  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`;
  const r = await fetch(url, { headers: { "x-api-key": key } });
  if (!r.ok) return null;

  const data = await r.json().catch(() => null) as any;
  const user = data?.users?.[0];
  const raw = user?.experimental?.neynar_user_score ?? user?.score;
  return normalizeScore(raw);
}

function shouldAppend(prev: Snapshot | null, next: Snapshot): boolean {
  if (!prev) return true;
  const prevTs = Date.parse(prev.captured_at);
  const nextTs = Date.parse(next.captured_at);
  if (!Number.isFinite(prevTs) || !Number.isFinite(nextTs)) return true;
  // de-dupe: if within 2 hours, keep the latest only
  if (nextTs - prevTs < 2 * 60 * 60 * 1000) return false;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!kvEnabled || !kv) {
      return res.status(500).json({
        ok: false,
        error:
          "Upstash is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.",
      });
    }

    const fid = Number(req.query.fid);
    if (!Number.isInteger(fid) || fid <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid fid. Example: /api/score?fid=3" });
    }

    const score = await fetchNeynarScore(fid);
    if (score === null) {
      return res.status(502).json({
        ok: false,
        error:
          "Unable to fetch score from Neynar API. Check NEYNAR_API_KEY and try again.",
      });
    }

    const now = new Date().toISOString();
    const snapshot: Snapshot = { fid, score, captured_at: now, source: "api" };

    const key = SNAP_KEY(fid);
    const existing = (await kv.get<Snapshot[]>(key)) ?? [];
    const last = existing.length ? existing[existing.length - 1] : null;

    let nextList = existing;
    if (shouldAppend(last, snapshot)) {
      nextList = [...existing, snapshot].slice(-MAX_SNAPSHOTS);
      await kv.set(key, nextList);
    } else {
      // overwrite the last snapshot when we're in the dedupe window
      nextList = existing.slice();
      if (nextList.length) nextList[nextList.length - 1] = snapshot;
      else nextList = [snapshot];
      await kv.set(key, nextList);
    }

    // keep a lightweight "recently viewed" list for cron
    const tracked = (await kv.get<number[]>(TRACKED_KEY)) ?? [];
    if (!tracked.includes(fid)) {
      await kv.set(TRACKED_KEY, [fid, ...tracked].slice(0, 200));
    }

    return res.status(200).json({ ok: true, fid, score, captured_at: now });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Server error" });
  }
}
