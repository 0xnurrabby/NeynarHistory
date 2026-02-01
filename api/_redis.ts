import { Redis } from '@upstash/redis'

export function redisEnabled() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export const redis = Redis.fromEnv()

export async function redisSafe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    if (!redisEnabled()) return { ok: false, error: 'Upstash Redis not configured' }
    const value = await fn()
    return { ok: true, value }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Redis error' }
  }
}
