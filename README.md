# Neynar History (Farcaster Mini App)

**Domain:** https://neynar-history.vercel.app/  
**Primary route:** /

This repo is a production-ready Farcaster Mini App for viewing **Neynar User Score** (0–1) and a **snapshot-based history** (7/30/90 days) for any Farcaster user by **@handle** or **FID**.

---

## Product spec (concise)

### Screens
**1) Home**
- Header + short description.
- **Sign in with Farcaster** CTA.
- After sign-in:
  - Identity card (FID + handle if available, optional avatar).
  - Current score + “Last fetched”.
  - CTA: **View 90-day history**.
- Search card:
  - Input: `@handle` or numeric `FID`
  - Button: **Open**
  - Error messaging with examples.
- “Possible factors (not guaranteed)” panel with explicit disclaimers.

**2) User Score**
- Top summary:
  - Current score (0–1) + “Last fetched at”
  - Badge: **Up / Down / Flat since last snapshot**
  - Buttons: **Refresh**, **Track/Untrack**, **Export CSV**
- History:
  - Range toggle: **7 / 30 / 90**
  - Line graph (date → score) with tooltips
  - Table view (timestamp, score, delta vs previous)
  - “Score change timeline” (only entries where score changed)
  - If < 90d snapshots: label “History begins on <date>”
- Disclaimers: neutral language, no “good/bad”.

### User flows
**A) First open → Sign In**
1. App loads inside Farcaster Mini App chrome.
2. Calls `sdk.actions.ready()` immediately.
3. User taps **Sign in with Farcaster**.
4. Store identity locally; show current score and history CTA.

**B) Search / Lookup**
1. User enters `@handle` or `FID`.
2. If `@handle`, resolve via FName Registry (`fnames.farcaster.xyz`) to FID.
3. Navigate to User Score view with canonical FID.

**C) User Score view**
1. Load stored snapshots (local + optional server KV).
2. On-demand fetch latest onchain score and store a snapshot (deduped).
3. Render graph + table + change timeline.

### Snapshot data model
`Snapshot = { fid, score, captured_at, source }`

- `score` is normalized to **0..1**
- `captured_at` is ISO timestamp
- `source` is `onchain` (default) or `api` (optional)

### Snapshot strategy
- **On-demand:** every time a user is viewed, fetch latest score and store a snapshot.
- **Deduplication:** if snapshots happen within **30 minutes**, replace the last one (keeps history tidy).
- **Scheduled (optional):** Vercel Cron calls `/api/cron/snapshot` every 12 hours to refresh tracked FIDs.

### “Possible factors (not guaranteed)” language (required)
> **Possible factors (not guaranteed)**  
> - Reduced activity over time can be associated with lower scores.  
> - Model recalibrations can shift scores across many accounts at once.  
>  
> **Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.**

---

## Tech notes

### Mini App detection (non-negotiable)
- `/.well-known/farcaster.json` exists (in `public/.well-known/farcaster.json`)
- `homeUrl` uses **https://neynar-history.vercel.app/**
- `miniapp.imageUrl` points to **/assets/embed-3x2.png**
- Both meta tags exist in `index.html`:
  - `<meta name="fc:miniapp" ...>`
  - `<meta name="fc:frame" ...>`
- JSON is valid, single-line, and uses action type **"launch_frame"**
- `sdk.actions.ready()` is called on app boot

### Score source
- Primary score read is **onchain** using Neynar’s onchain score contract (Base mainnet).
- Handle → FID resolution uses Farcaster’s **FName Registry** server API.

---

## Local dev
```bash
pnpm i
pnpm dev
```

> Note: Outside a Farcaster client, the app intentionally shows a “Open in a Farcaster client” gate (no browser-mode fallback UX).

---

## Deploy on Vercel
- Deploy as a static build + serverless functions (already configured in `vercel.json`).
- Optional: enable **Vercel KV** for cross-device persistence + cron snapshots:
  - Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars.

---

## Files you must verify after deploy
- https://neynar-history.vercel.app/.well-known/farcaster.json
- https://neynar-history.vercel.app/assets/embed-3x2.png
- https://neynar-history.vercel.app/ (view-source for the fc meta tags)
