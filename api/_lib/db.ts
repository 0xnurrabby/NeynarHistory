import { sql } from '@vercel/postgres';

export async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS score_snapshots (
    id BIGSERIAL PRIMARY KEY,
    fid BIGINT NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS score_snapshots_fid_captured_at_idx ON score_snapshots (fid, captured_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS tracked_fids (
    fid BIGINT PRIMARY KEY,
    tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS recent_views (
    fid BIGINT PRIMARY KEY,
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export { sql };
