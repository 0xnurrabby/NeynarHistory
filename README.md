# Neynar History — Farcaster Mini App (Vercel)

Domain is **hard-coded** to: https://neynar-history.vercel.app/

## Product spec (concise)

### Screens
- **Home**
  - “Sign in with Farcaster” (SIWF via Mini App host)
  - Shows identity (FID + @handle + optional avatar)
  - Shows latest known Neynar score
  - Search: @handle or numeric FID
  - CTA: View 90-day history
- **User Score**
  - Current score (0–1) + last fetched time
  - Badge: Up / Down / Flat vs last snapshot
  - Range toggles: 7 / 30 / 90 days
  - Line chart + table
  - Change timeline list (only when score changed)
  - Track button (pins fid for cron snapshots)
  - Export CSV

### Snapshot store
`snapshots(fid, score, captured_at)` and `tracked(fid, last_viewed_at, pinned)` in Vercel Postgres.

### Snapshot strategy
- On-demand: viewing a user fetches latest score and stores snapshot (deduped to 1 per 6 hours).
- Scheduled (optional): Vercel Cron hits `/api/cron?secret=...` to refresh pinned/recent fids.

### Disclaimer language (used in UI)
**Possible factors (not guaranteed)**  
Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit. Reduced activity over time can be associated with lower scores. Model recalibrations can shift scores across many accounts at once.

## Vercel deployment

### Required env vars
- `NEYNAR_API_KEY`
- Add **Vercel Postgres** to the project (Vercel injects `POSTGRES_URL` etc.)

### Optional env vars
- `CRON_SECRET` (only if you enable scheduled snapshots)

### Optional cron
Create a Vercel Cron job:
- Path: `/api/cron?secret=<CRON_SECRET>`
- Suggested schedule: every 6 hours

## Local dev
```bash
npm install
npm run dev
```
