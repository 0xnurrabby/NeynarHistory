import { z } from "zod";
import { json, errorJson } from "./_util";
import { ensureSchema, sql } from "./_db";

export const config = { runtime: "edge" };

const Body = z.object({
  fid: z.coerce.number().int().positive(),
  pinned: z.boolean().optional(),
});

export default async function handler(req: Request) {
  if (req.method !== "POST") return errorJson("Method not allowed", 405);
  try {
    const body = await req.json();
    const parsed = Body.safeParse(body);
    if (!parsed.success) return errorJson("Invalid body", 400);

    const { fid, pinned } = parsed.data;

    await ensureSchema();

    // If pinned is undefined, keep existing value.
    const pinnedValue = pinned === undefined ? null : pinned;

    await sql`
      INSERT INTO tracked (fid, last_viewed_at, pinned)
      VALUES (${fid}, NOW(), COALESCE(${pinnedValue}::boolean, FALSE))
      ON CONFLICT (fid) DO UPDATE SET
        last_viewed_at = NOW(),
        pinned = COALESCE(${pinnedValue}::boolean, tracked.pinned);
    `;

    return json({ ok: true });
  } catch (e: any) {
    return errorJson(e?.message || "Track failed", 500);
  }
}
