import { z } from "zod";
import { json, errorJson, DOMAIN } from "../_util";
import { ensureSchema, sql } from "../_db";
import { neynarGet } from "../_neynar";
import { createAppClient, viemConnector } from "@farcaster/auth-client";

export const config = { runtime: "edge" };



const Body = z.object({
  nonce: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
});

export default async function handler(req: Request) {
  if (req.method !== "POST") return errorJson("Method not allowed", 405);
  try {
    const body = await req.json();
    const parsed = Body.safeParse(body);
    if (!parsed.success) return errorJson("Invalid body", 400);

    const { nonce, message, signature } = parsed.data;

    const appClient = createAppClient({ relay: "https://relay.farcaster.xyz", ethereum: viemConnector() });
    const result: any = await appClient.verifySignInMessage({
      domain: DOMAIN,
      nonce,
      message,
      signature,
      acceptAuthAddress: true,
    });

    if (!result?.success || !result?.fid) {
      return errorJson(result?.error?.message || "Verification failed", 401);
    }

    const fid = Number(result.fid);

    let profile: any = null;
    try {
      const data = await neynarGet(`/v2/farcaster/user/bulk/?fids=${fid}`);
      profile = data?.users?.[0] ?? data?.result?.users?.[0] ?? null;
    } catch {
      profile = null;
    }

    await ensureSchema();
    await sql`
      INSERT INTO tracked (fid, last_viewed_at, pinned)
      VALUES (${fid}, NOW(), TRUE)
      ON CONFLICT (fid) DO UPDATE SET last_viewed_at = NOW(), pinned = TRUE;
    `;

    const token = `fid:${fid}:${Date.now()}`;

    return json({
      success: true,
      fid,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      pfp_url: profile?.pfp_url ?? null,
      token
    });
  } catch (e: any) {
    return errorJson(e?.message || "Verify failed", 500);
  }
}
