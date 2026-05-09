<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,8,15&height=180&section=header&text=NeynarHistory&fontSize=48&fontColor=000000&fontAlignY=38&desc=Track+Farcaster+Neynar+score+history+over+7%2F30%2F90+days&descAlignY=58&descSize=14&animation=fadeIn" width="100%"/>

<div align="center">

[![Live](https://img.shields.io/badge/Live%20App-bbf7d0?style=for-the-badge&logoColor=000)](https://neynar-history.vercel.app)
[![License](https://img.shields.io/badge/MIT-bfdbfe?style=for-the-badge&logoColor=000)](LICENSE)
[![Platform](https://img.shields.io/badge/Farcaster%20Mini%20App-fde68a?style=for-the-badge&logoColor=000)]()
[![Tech](https://img.shields.io/badge/TypeScript%20%2B%20Vite-fca5a5?style=for-the-badge&logoColor=000)]()

</div>

<div align="center">
<i>Sign in with Farcaster, view your current Neynar score, and see how it changed over the last 7, 30, or 90 days with a line chart and change timeline.</i>
</div>

---

## ✦ Features

<div align="center">

| | Feature | What it does |
|:---:|---|---|
| 🔐 | Sign in with Farcaster | Auth via SIWF through the Mini App host |
| 📊 | Score history chart | Line chart of Neynar score over 7 / 30 / 90 days |
| 🔍 | Search any user | Look up any @handle or FID |
| 📈 | Up / Down / Flat badge | Shows direction vs last snapshot at a glance |
| 📋 | Change timeline | Lists only days when the score actually changed |
| 📌 | Track users | Pin a FID to include it in scheduled cron snapshots |
| 💾 | Export CSV | Download the full score history as a CSV file |
| 🗄️ | Vercel Postgres | Snapshots stored in Postgres, deduped to 1 per 6 hours |

</div>

---

## ✦ Download & Run

**Step 1** .... Clone the repo

```bash
git clone https://github.com/0xnurrabby/NeynarHistory
cd NeynarHistory
```

**Step 2** .... Install and configure

```bash
npm install
# Create .env with required vars (see Setup)
```

**Step 3** .... Start dev server

```bash
npm run dev
# Open http://localhost:5173
```

---

## ✦ Setup

```
1. Clone the repo and run npm install
2. Create a .env file with:
   NEYNAR_API_KEY=your_neynar_api_key
3. Add a Vercel Postgres database to your project
   (Vercel injects POSTGRES_URL and related vars automatically)
4. Optional: add CRON_SECRET for scheduled snapshot refreshes
5. Run npm run dev
6. For production: deploy to Vercel
   - Add the Postgres integration in Vercel dashboard
   - Set NEYNAR_API_KEY in environment variables
   - Optional cron: create a Vercel Cron job pointing to
     /api/cron?secret=<CRON_SECRET> on a 6-hour schedule
```

---

## ✦ Project Structure

```
NeynarHistory/
  src/           ->  React + TypeScript frontend (score chart, user search)
  api/           ->  Vercel serverless functions (score fetch, snapshots, cron)
  index.html     ->  entry point with Farcaster mini app meta
  public/        ->  static assets
  package.json
  vite.config.js
  vercel.json
```

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2,8,15&height=100&section=footer&animation=fadeIn" width="100%"/>

<div align="center">MIT License .... built by <a href="https://github.com/0xnurrabby">0xnurrabby</a></div>
