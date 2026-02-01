import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

export function redisEnabled() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export function redis() {
  if (_redis) return _redis
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  })
  return _redis
}

export async function redisSafe<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  if (!redisEnabled()) return { ok: false, error: 'UPSTASH_REDIS_REST_URL/TOKEN not configured' }
  try {
    const value = await fn()
    return { ok: true, value }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Redis error' }
  }
}
