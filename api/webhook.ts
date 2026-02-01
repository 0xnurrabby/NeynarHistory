import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Placeholder webhook endpoint for Mini App hosts that may ping it.
  return res.status(200).json({ ok: true });
}
