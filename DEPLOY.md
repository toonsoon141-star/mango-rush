# 🥭 MANGO RUSH — Deployment Guide

Your app is a Node.js (Express + SQLite) server with a Telegram mini app + admin panel.
It needs an **always-on host with a public HTTPS URL and a persistent disk** (the SQLite
database `data.db` must survive restarts).

---

## ✅ 0. Before deploying — finish these in Telegram

1. **Add the bot as ADMIN to all 4 gate channels** (membership check needs it):
   - `@MangoRush_comminuty` (Community) → Add member → `@Mango_Rush0_bot` → promote to **Administrator**
   - `@FreeCryptoHub_1` (Free Crypto Hub) → same
   - `@mangoRush_chat` (Chat) → same
   - `@MangoRush_Proof` (Payment) → same
2. In **BotFather**:
   - `/mybots` → `@Mango_Rush0_bot` → **Bot Settings → Menu Button** → URL = your app URL (after deploy)
   - **Bot Settings → Commands** → add:
     - `start - Open MANGO RUSH`
     - `admin - Admin panel`
   - **Bot Settings → Mini App** (or `/newapp`) → set web app URL = your app URL

---

## 🚀 Option A — Render (easiest)

1. Push this folder to a **GitHub** repo (do NOT commit `.env` or `data.db` — they're gitignored).
2. [render.com](https://render.com) → **New +** → **Blueprint** → connect the repo.
   - It reads `render.yaml` automatically.
   - Use the **Starter** plan so the persistent disk works (free tier has ephemeral disk + sleeps).
3. In the service **Environment** tab, set the secret env vars:
   - `BOT_TOKEN` = `8955979114:AAHYGZa_3XfOF8FEha8u7y7MB06NKAjIUcc`
   - (`APP_URL` is auto-detected via `RENDER_EXTERNAL_URL` — you can leave it empty)
4. Deploy. Your URL will look like `https://mango-rush.onrender.com`.

> ⚠️ Do **NOT** set `DEMO_MODE`. The `.env` in the repo has it for local preview only and is
> not used on Render (env comes from the dashboard).

---

## 🚀 Option B — Railway

1. Push to GitHub → [railway.app](https://railway.app) → **New Project → Deploy from GitHub**.
2. Add a **Volume** and mount it at `/app/data`.
3. Set env vars (same as Render):
   - `BOT_TOKEN`, `DB_PATH=/app/data/data.db`, `WITHDRAW_CHANNEL=@MangoRush_Proof`, `BOT_USERNAME=Mango_Rush0_bot`
   - `APP_URL` auto-detects via `RAILWAY_PUBLIC_DOMAIN`.
4. Deploy → URL like `https://mango-rush.up.railway.app`.

---

## 🚀 Option C — VPS (cheapest long-term, most control)

```bash
# on the VPS (Ubuntu/Debian)
git clone <your-repo> mango-rush && cd mango-rush
cp .env.example .env        # then edit: BOT_TOKEN, APP_URL, remove DEMO_MODE
docker build -t mango-rush .
docker run -d --name mango-rush \
  -p 3000:3000 \
  -v /opt/mango-rush/data:/app/data \
  -e DB_PATH=/app/data/data.db \
  --env-file .env \
  --restart unless-stopped \
  mango-rush
```

Point a domain (with HTTPS via Caddy/Nginx + Let's Encrypt) at the server and set `APP_URL`.

---

## 🧪 5. Post-deploy verification

1. Open `https://<your-url>/api/health` → `{"ok":true,"app":"MANGO RUSH","mode":"production"}`.
2. In Telegram, open `@Mango_Rush0_bot` → **Start** → tap **Open MANGO RUSH**.
   - Gate screen shows the 4 channels → after joining → **Verify & Continue**.
3. `/admin` in the bot chat → **Open Admin Panel** button → log in with your username + password.
4. Full flow test: earn → set wallet → request withdraw → approve in admin → "Payment Sent"
   appears in `@MangoRush_Proof` and the user gets notified.
5. Invite a friend via the referral link → +30 instant → activate → +70 + 5% commission.

---

## 🔧 Environment variables reference

| Var | Required | Default | Notes |
|---|---|---|---|
| `BOT_TOKEN` | ✅ prod | — | From BotFather |
| `BOT_USERNAME` | ✅ | `Mango_Rush0_bot` | Bot username |
| `APP_URL` | ✅ | auto on Render/Railway | Public HTTPS URL |
| `APP_SHORT` | — | `app` | BotFather mini-app short name |
| `DB_PATH` | — | `./data.db` | Set to a persistent-disk path in prod |
| `LIBSQL_URL` | — | — | Turso DB URL (free tier) — keeps data safe without a disk |
| `LIBSQL_AUTH_TOKEN` | — | — | Turso auth token (from dashboard/CLI) |
| `LIBSQL_SYNC_PERIOD` | — | `1` | Background sync interval (seconds) |
| `WITHDRAW_CHANNEL` | ✅ | `@MangoRush_Proof` | Proof channel (bot must be admin) |
| `MIN_WITHDRAW_USDT` | — | `0.1` | Min withdraw = 1000 Mango |
| `WITHDRAW_FEE_PCT` | — | `20` | Fixed withdraw fee % |
| `PORT` | — | `3000` | Render/Railway set this automatically |
| `DEMO_MODE` | ❌ prod | unset | `1` only for local preview |
