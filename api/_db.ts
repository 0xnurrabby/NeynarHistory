import { sql as vercelSql } from "@vercel/postgres";

/**
 * DB ENV NORMALIZATION
 * Vercel Postgres SDK looks for POSTGRES_URL by default.
 * Neon Marketplace integrations often provide DATABASE_URL.
 * We normalize so POSTGRES_URL is always present for the SDK.
 */
function normalizeEnv() {
  const cs =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED;

  if (!process.env.POSTGRES_URL && cs) {
    // eslint-disable-next-line no-process-env
    process.env.POSTGRES_URL = cs;
  }
}

normalizeEnv();

export const sql = vercelSql;

let didInit = false;

export async function ensureSchema() {
  if (didInit) return;

  // Snapshots: fid + score at captured_at
  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id BIGSERIAL PRIMARY KEY,
      fid BIGINT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_fid ON snapshots(fid);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_fid_captured_at ON snapshots(fid, captured_at DESC);`;

  // Tracked users (optional)
  await sql`
    CREATE TABLE IF NOT EXISTS tracked (
      fid BIGINT PRIMARY KEY,
      last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pinned BOOLEAN NOT NULL DEFAULT FALSE
    );
  `;

  // Cache of Farcaster identity for display
  await sql`
    CREATE TABLE IF NOT EXISTS identity_cache (
      fid BIGINT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      pfp_url TEXT,
      custody_address TEXT,
      last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  didInit = true;
}
