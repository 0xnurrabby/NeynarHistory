import { requireEnv } from "./_util";

const NEYNAR_API_KEY = () => requireEnv("NEYNAR_API_KEY");

export async function neynarGet(path: string) {
  const url = `https://api.neynar.com${path}`;
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "x-api-key": NEYNAR_API_KEY(),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Neynar HTTP ${res.status}`);
  try { return JSON.parse(text); } catch { throw new Error("Invalid JSON from Neynar"); }
}

export function extractScore(user: any): number | null {
  const raw = user?.experimental?.neynar_user_score;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
