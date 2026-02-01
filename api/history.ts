import { z } from "zod";
import { json, errorJson } from "./_util";
import { ensureSchema, sql } from "./_db";

export const config = { runtime: "edge" };

const Q = z.object({
  fid: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(1).max(365).default(90),
});

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = Q.safeParse({
      fid: url.searchParams.get("fid"),
      days: url.searchParams.get("days") ?? "90",
    });
    if (!parsed.success) return errorJson("Invalid query", 400);

    const { fid, days } = parsed.data;

    await ensureSchema();
    const { rows } = await sql`
      SELECT fid, score, captured_at
      FROM snapshots
      WHERE fid = ${fid}
        AND captured_at >= NOW() - (${days} || ' days')::interval
      ORDER BY captured_at ASC;
    `;

    const snapshots = rows.map((r: any) => ({
      fid: Number(r.fid),
      score: Number(r.score),
      captured_at: new Date(r.captured_at).toISOString(),
    }));

    return json({ snapshots });
  } catch (e: any) {
    return errorJson(e?.message || "History failed", 500);
  }
}
