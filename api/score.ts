import { json, errorJson } from "./_util";
import { neynarGet, extractScore } from "./_neynar";
import { ensureSchema, sql } from "./_db";
import { z } from "zod";

export const config = { runtime: "edge" };

const Q = z.object({ fid: z.coerce.number().int().positive() });

/**
 * Very small in-memory cache per Edge instance.
 * This protects Neynar free tier from bursts caused by re-renders / multiple concurrent requests.
 */
const memCache = new Map<number, { exp: number; value: any }>();
const inflight = new Map<number, Promise<any>>();

async function storeSnapshot(fid: number, score: number) {
  await ensureSchema();

  // Deduplicate within last 6 hours (keep only the latest in that window).
  const windowHours = 6;
  await sql`
    DELETE FROM snapshots
    WHERE fid = ${fid}
      AND captured_at > NOW() - (${windowHours} || ' hours')::interval;
  `;
  await sql`INSERT INTO snapshots (fid, score, captured_at) VALUES (${fid}, ${score}, NOW());`;
}

async function upsertIdentity(fid: number, user: any) {
  await ensureSchema();
  const username = user?.username ?? null;
  const display_name = user?.display_name ?? null;
  const pfp_url = user?.pfp_url ?? null;
  const custody_address = user?.custody_address ?? null;

  await sql`
    INSERT INTO identity_cache (fid, username, display_name, pfp_url, custody_address, last_updated_at)
    VALUES (${fid}, ${username}, ${display_name}, ${pfp_url}, ${custody_address}, NOW())
    ON CONFLICT (fid) DO UPDATE SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      pfp_url = EXCLUDED.pfp_url,
      custody_address = EXCLUDED.custody_address,
      last_updated_at = NOW()
  `;
}

async function readCachedIdentity(fid: number) {
  await ensureSchema();
  const rows = await sql`
    SELECT fid, username, display_name, pfp_url
    FROM identity_cache
    WHERE fid = ${fid}
    LIMIT 1
  `;
  return rows?.rows?.[0] ?? null;
}

async function readLastSnapshot(fid: number) {
  await ensureSchema();
  const rows = await sql`
    SELECT score, captured_at
    FROM snapshots
    WHERE fid = ${fid}
    ORDER BY captured_at DESC
    LIMIT 1
  `;
  return rows?.rows?.[0] ?? null;
}

function parseRetrySecondsFromNeynar(msg: string): number {
  // Neynar error text often contains: "Maximum of 6 requests per 60s window"
  const m = msg.match(/per\s+(\d+)s\s+window/i);
  if (m) return Math.max(5, Number(m[1]) || 60);
  return 60;
}

async function fetchScoreFromNeynar(fid: number) {
  // Neynar endpoint: /v2/farcaster/user/bulk
  const data = await neynarGet(`/v2/farcaster/user/bulk?fids=${fid}`);
  const user = data?.users?.[0] ?? data?.result?.users?.[0] ?? null;
  if (!user) throw new Error("User not found");

  const score = extractScore(user);

  const card = {
    fid,
    username: user?.username ?? null,
    display_name: user?.display_name ?? null,
    pfp_url: user?.pfp_url ?? null,
    score,
    last_fetched_at: new Date().toISOString(),
    is_stale: false,
  };

  // Best-effort DB writes
  try {
    if (typeof score === "number") await storeSnapshot(fid, score);
    await upsertIdentity(fid, user);
  } catch {
    // ignore
  }

  return card;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = Q.safeParse({ fid: url.searchParams.get("fid") });
    if (!parsed.success) return errorJson("Invalid fid. Example: 3", 400);

    const fid = parsed.data.fid;

    // Memory cache: 60s
    const now = Date.now();
    const cached = memCache.get(fid);
    if (cached && cached.exp > now) {
      return json(cached.value, 200, { mode: "edge", sMaxage: 60, swr: 300 });
    }

    // Deduplicate concurrent requests per instance
    const existing = inflight.get(fid);
    if (existing) {
      const value = await existing;
      return json(value, 200, { mode: "edge", sMaxage: 60, swr: 300 });
    }

    const p = (async () => {
      try {
        const value = await fetchScoreFromNeynar(fid);
        memCache.set(fid, { exp: Date.now() + 60_000, value });
        return value;
      } catch (e: any) {
        const msg = String(e?.message || e);
        // If Neynar rate-limits us, fall back to cached DB snapshot/identity.
        if (/ratelimit/i.test(msg) || /rate limit/i.test(msg) || /RateLimit/i.test(msg)) {
          const retryAfterSeconds = parseRetrySecondsFromNeynar(msg);

          let identity: any = null;
          let last: any = null;
          try {
            identity = await readCachedIdentity(fid);
            last = await readLastSnapshot(fid);
          } catch {
            // ignore
          }

          const fallback = {
            fid,
            username: identity?.username ?? null,
            display_name: identity?.display_name ?? null,
            pfp_url: identity?.pfp_url ?? null,
            score: last?.score ?? null,
            last_fetched_at: last?.captured_at ? new Date(last.captured_at).toISOString() : null,
            is_stale: true,
            warning: "Rate limited by Neynar. Showing last stored data.",
            retry_after_seconds: retryAfterSeconds,
          };

          // short edge cache to reduce burst retries
          memCache.set(fid, { exp: Date.now() + 10_000, value: fallback });
          return fallback;
        }

        throw e;
      } finally {
        inflight.delete(fid);
      }
    })();

    inflight.set(fid, p);
    const value = await p;

    return json(value, 200, { mode: "edge", sMaxage: 60, swr: 300 });
  } catch (e: any) {
    return errorJson(String(e?.message || e), 500);
  }
}
