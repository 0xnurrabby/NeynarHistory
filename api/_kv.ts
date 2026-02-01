import { kv } from '@vercel/kv'

export function kvEnabled() {
  // Vercel KV uses env vars; if missing, kv calls will throw.
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function kvSafe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    if (!kvEnabled()) return { ok: false, error: 'KV not configured' }
    const value = await fn()
    return { ok: true, value }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'KV error' }
  }
}

export { kv }
