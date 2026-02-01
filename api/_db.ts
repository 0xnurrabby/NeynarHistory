import { sql } from "@vercel/postgres";

let didInit = false;

export async function ensureSchema() {
  if (didInit) return;
  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id BIGSERIAL PRIMARY KEY,
      fid BIGINT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_fid_captured ON snapshots (fid, captured_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS tracked (
      fid BIGINT PRIMARY KEY,
      last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pinned BOOLEAN NOT NULL DEFAULT FALSE
    );
  `;
  didInit = true;
}

export { sql };
