import { Redis } from "@upstash/redis";

/**
 * Uses Upstash Redis REST env vars:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */
export const kvEnabled =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

export const kv = kvEnabled ? Redis.fromEnv() : null;

// Back-compat helper used by existing handlers
export const kvSafe = kv;
