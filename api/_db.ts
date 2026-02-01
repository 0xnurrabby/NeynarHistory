import { createPool } from "@vercel/postgres";

/**
 * IMPORTANT:
 * - We DO NOT rely on @vercel/postgres' implicit env lookup because:
 *   - Some Vercel Marketplace Postgres providers (e.g., Neon) inject DATABASE_URL but not always POSTGRES_URL in every env,
 *   - And importing `sql` can throw early if POSTGRES_URL is missing at import time.
 *
 * We explicitly pass a connection string and accept either POSTGRES_URL or DATABASE_URL.
 */
function getConnectionString(): string {
  const cs =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL;

  if (!cs) {
    throw new Error(
      "Missing database connection string. Set POSTGRES_URL (recommended) or DATABASE_URL in Vercel Environment Variables."
    );
  }
  return cs;
}

const pool = createPool({ connectionString: getConnectionString() });
export const sql = pool.sql;

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

  didInit = true;
}
