# Neynar History (Base + Farcaster Mini App)

**Hard domain:** https://neynar-history.vercel.app/

## Product spec (concise)

### Screens
- **Home**
  - If running inside a Farcaster client: shows **Sign in with Farcaster** CTA.
  - After sign-in: shows identity (FID + handle + avatar), latest score (0–1), and a **View 90-day history** CTA.
  - Search box: lookup by **@handle** or **FID**.

- **User Score**
  - Header: current score, last fetched timestamp, and badge **Up/Down/Flat** vs previous snapshot.
  - Range toggles: **7 / 30 / 90** days.
  - History: line chart (date → score), table (timestamp, score, Δ), and a change timeline (only score changes).
  - “Possible factors (not guaranteed)” panel with strong disclaimers.

### User flows
- Open → (optional) Sign in → view your score → view history.
- Search @handle/FID → resolve to FID → view that user.

### Data model
- `score_snapshots`: `{ fid, score, captured_at }`
- `tracked_fids`: `{ fid, tracked_at }`
- `recent_views`: `{ fid, last_viewed_at }`

### Snapshot strategy
- **On-demand:** each user view fetches the latest score from Neynar and writes a snapshot if:
  - last snapshot is older than ~6 hours, OR
  - score differs from last snapshot.
- **Scheduled:** Vercel Cron hits `/api/cron/snapshot` every 6 hours, snapshotting tracked + recently viewed FIDs.

### History UI behavior
- If fewer than 90 days exist: graph shows available range and labels “History begins on <date>”.
- Table includes Δ vs previous snapshot.
- Timeline only lists score changes.

### Disclaimers language
**Possible factors (not guaranteed)**
- “Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.”
- “Reduced activity over time can be associated with lower scores.”
- “Model recalibrations can shift scores across many accounts at once.”

## Setup (Vercel)
1. Create a Vercel Postgres database and set `POSTGRES_URL` (Vercel does this automatically when you attach Postgres).
2. Set `NEYNAR_API_KEY` in Vercel Env.
3. (Recommended) Set `CRON_SECRET` and add it as `x-cron-secret` header in Vercel Cron settings.

## Important
- `/public/.well-known/farcaster.json` includes an **accountAssociation placeholder**. For publishing/discovery, replace it with a valid association (Base Build → “Account association” tab).