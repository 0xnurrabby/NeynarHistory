import { json, errorJson } from "./_util";
import { neynarGet, extractScore } from "./_neynar";
import { ensureSchema, sql } from "./_db";
import { z } from "zod";

export const config = { runtime: "edge" };

const Q = z.object({ fid: z.coerce.number().int().positive() });

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
    const parsed = Q.safeParse({ fid: url.searchParams.get("fid") });
    if (!parsed.success) return errorJson("Invalid fid. Example: 3", 400);

    const fid = parsed.data.fid;

    const data = await neynarGet(`/v2/farcaster/user/bulk/?fids=${fid}`);
    const user = data?.users?.[0] ?? data?.result?.users?.[0] ?? null;
    if (!user) return errorJson("User not found", 404);

    const score = extractScore(user);

    const card = {
      fid,
      username: user?.username ?? null,
      display_name: user?.display_name ?? null,
      pfp_url: user?.pfp_url ?? null,
      score,
      last_fetched_at: new Date().toISOString(),
    };

    if (score !== null) await storeSnapshot(fid, score);

    await ensureSchema();
    await sql`
      INSERT INTO tracked (fid, last_viewed_at, pinned)
      VALUES (${fid}, NOW(), FALSE)
      ON CONFLICT (fid) DO UPDATE SET last_viewed_at = NOW();
    `;

    return json(card);
  } catch (e: any) {
    return errorJson(e?.message || "Score fetch failed", 500);
  }
}
