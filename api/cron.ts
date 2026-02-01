import { z } from "zod";
import { json, errorJson, requireEnv } from "./_util";
import { ensureSchema, sql } from "./_db";
import { neynarGet, extractScore } from "./_neynar";

export const config = { runtime: "edge" };

const Q = z.object({ secret: z.string().min(1) });

async function storeSnapshot(fid: number, score: number) {
  await ensureSchema();
  const windowHours = 6;
  await sql`
    DELETE FROM snapshots
    WHERE fid = ${fid}
      AND captured_at > NOW() - (${windowHours} || ' hours')::interval;
  `;
  await sql`INSERT INTO snapshots (fid, score, captured_at) VALUES (${fid}, ${score}, NOW());`;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = Q.safeParse({ secret: url.searchParams.get("secret") || "" });
    if (!parsed.success) return errorJson("Missing secret", 400);

    const expected = requireEnv("CRON_SECRET");
    if (parsed.data.secret !== expected) return errorJson("Forbidden", 403);

    await ensureSchema();
    const { rows } = await sql`
      SELECT fid
      FROM tracked
      WHERE pinned = TRUE OR last_viewed_at >= NOW() - ('30 days')::interval
      ORDER BY pinned DESC, last_viewed_at DESC
      LIMIT 50;
    `;
    const fids = rows.map((r: any) => Number(r.fid)).filter((n) => Number.isFinite(n) && n > 0);

    const results: Array<{ fid: number; ok: boolean; error?: string }> = [];
    for (const fid of fids) {
      try {
        const data = await neynarGet(`/v2/farcaster/user/bulk/?fids=${fid}`);
        const user = data?.users?.[0] ?? data?.result?.users?.[0] ?? null;
        const score = user ? extractScore(user) : null;
        if (score !== null) await storeSnapshot(fid, score);
        results.push({ fid, ok: true });
      } catch (e: any) {
        results.push({ fid, ok: false, error: e?.message || "fetch failed" });
      }
    }

    return json({ ok: true, count: results.length, results });
  } catch (e: any) {
    return errorJson(e?.message || "Cron failed", 500);
  }
}
