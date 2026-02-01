import { z } from "zod";
import { json, errorJson } from "./_util";
import { neynarGet } from "./_neynar";

export const config = { runtime: "edge" };

const Q = z.object({ handle: z.string().min(1).max(64) });

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = Q.safeParse({ handle: url.searchParams.get("handle") || "" });
    if (!parsed.success) return errorJson("Invalid handle. Example: @dwr", 400);

    const handle = parsed.data.handle.replace(/^@/, "");
    const data = await neynarGet(`/v2/farcaster/user/by_username?username=${encodeURIComponent(handle)}`);
    const fid = Number(data?.user?.fid);
    if (!Number.isFinite(fid) || fid <= 0) return errorJson("User not found", 404);

    // handle->fid mapping is stable; cache it at the edge for 10 minutes
    return json({ fid }, 200, { mode: "edge", sMaxage: 600, swr: 3600 });
  } catch (e: any) {
    return errorJson(String(e?.message || e), 500);
  }
}
