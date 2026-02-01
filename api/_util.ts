import { z } from "zod";

export const DOMAIN = "neynar-history.vercel.app";

export function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function errorJson(message: string, status = 400) {
  return json({ error: message }, status);
}

export function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const FidSchema = z.coerce.number().int().positive();
