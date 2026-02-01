import { z } from "zod";

export const DOMAIN = "neynar-history.vercel.app";

type CacheOpts =
  | { mode: "no-store" }
  | { mode: "edge"; sMaxage: number; swr?: number }; // Vercel Edge Cache

function cdnCacheValue(c: Extract<CacheOpts, { mode: "edge" }>): string {
  const swr = c.swr ?? 0;
  return `s-maxage=${c.sMaxage}${swr ? `, stale-while-revalidate=${swr}` : ""}`;
}

export function json(res: any, status = 200, cache?: CacheOpts) {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
  };

  if (!cache || cache.mode === "no-store") {
    headers["cache-control"] = "no-store";
  } else {
    // Vercel caches API responses in its CDN when CDN-Cache-Control / Vercel-CDN-Cache-Control is set.
    // If you only set Cache-Control, Vercel may strip s-maxage/stale-while-revalidate. See Vercel docs.
    const cdn = cdnCacheValue(cache);
    headers["cache-control"] = "public, max-age=0, must-revalidate";
    headers["cdn-cache-control"] = cdn;
    headers["vercel-cdn-cache-control"] = cdn;
  }

  return new Response(JSON.stringify(res), { status, headers });
}

export function errorJson(message: string, status = 400) {
  return json({ error: message }, status, { mode: "no-store" });
}

export function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const FidSchema = z.coerce.number().int().positive();
