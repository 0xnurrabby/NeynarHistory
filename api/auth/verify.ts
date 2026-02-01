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

    // IMPORTANT: ethereum connector is required, otherwise auth-client can throw.
    const appClient = createAppClient({
      relay: "https://relay.farcaster.xyz",
      ethereum: viemConnector(process.env.OP_MAINNET_RPC_URL || process.env.OPTIMISM_RPC_URL),
    });

    const result = await appClient.verifySignInMessage({
      domain: DOMAIN,
      nonce,
      message,
      signature,
      acceptAuthAddress: true,
    });

    if (!result.success) {
      return errorJson(typeof result.error === "string" ? result.error : JSON.stringify(result.error ?? "Sign-in verification failed"), 401);
    }

    const fid = result.fid;

    // Fetch profile from Neynar (best-effort)
    let profile: any = null;
    try {
      profile = await neynarGet(`/v2/farcaster/user/bulk?fids=${fid}`);
    } catch {
      // ignore
    }

    const user = profile?.users?.[0];
    const identity = {
      fid,
      username: user?.username || null,
      display_name: user?.display_name || null,
      pfp_url: user?.pfp_url || null,
      custody_address: user?.custody_address || null,
    };

    // DB write is best-effort: auth should still succeed even if DB is temporarily unavailable.
    try {
      await ensureSchema();
      await sql`
        INSERT INTO identity_cache (fid, username, display_name, pfp_url, custody_address, last_updated_at)
        VALUES (${fid}, ${identity.username}, ${identity.display_name}, ${identity.pfp_url}, ${identity.custody_address}, NOW())
        ON CONFLICT (fid) DO UPDATE SET
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          pfp_url = EXCLUDED.pfp_url,
          custody_address = EXCLUDED.custody_address,
          last_updated_at = NOW();
      `;
    } catch (e: any) {
      // Return identity, but include a warning for debugging in UI logs if needed.
      return json({ ok: true, identity, dbWarning: e?.message || "db_write_failed" });
    }

    return json({ ok: true, identity });
  } catch (e: any) {
    return errorJson(e?.message || "Verify failed", 500);
  }
}
