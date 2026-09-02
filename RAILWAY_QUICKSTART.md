# 🥭 MANGO RUSH — Railway Quick Deploy (free + easy path)

Time: ~15 minutes. Stays on the free plan — the database lives on **Turso** (free tier),
so no paid plan or volume is needed.

## 1. Get the code into GitHub (5 min)

1. Create a new **private** repo on GitHub named e.g. `mango-rush`.
2. On your PC (with the project folder):
```bash
cd telegram-airdrop-app
git init
git add .
git commit -m "MANGO RUSH initial"
git branch -M main
git remote add origin https://github.com/<YOU>/mango-rush.git
git push -u origin main
```
> `.gitignore` already excludes `.env`, `data.db`, `node_modules`, `uploads`.

## 2. Create the free database on Turso (3 min)

1. Go to [turso.tech](https://turso.tech) → **Sign in with GitHub** (no card needed).
2. Install the CLI and create a DB (or use the web dashboard):
```bash
curl -sSfL https://get.turso.tech | bash
turso auth login
turso db create mango-rush
turso db show mango-rush --url        # → libsql://mango-rush-<you>.turso.io
turso db tokens create mango-rush     # → the AUTH TOKEN (copy it!)
```
> Keep the URL + token — you'll paste them into Railway next.

## 3. Deploy on Railway (3 min)

1. Go to [railway.com](https://railway.com) → **Sign in with GitHub**.
2. **New Project → Deploy from GitHub repo** → select `mango-rush`.
3. Railway detects `railway.json` + `Dockerfile` and builds automatically.
   - Healthcheck is `/api/health`, restart policy `ON_FAILURE` (bot stays always-on).

## 4. Set environment variables

Service → **Variables** → add:

| Key | Value |
|---|---|
| `BOT_TOKEN` | `8955979114:AAHYGZa_3XfOF8FEha8u7y7MB06NKAjIUcc` |
| `BOT_USERNAME` | `Mango_Rush0_bot` |
| `LIBSQL_URL` | `libsql://mango-rush-<you>.turso.io` (from step 2) |
| `LIBSQL_AUTH_TOKEN` | the token from `turso db tokens create` |
| `WITHDRAW_CHANNEL` | `@MangoRush_Proof` |
| `MIN_WITHDRAW_USDT` | `0.1` |
| `WITHDRAW_FEE_PCT` | `20` |
| `APP_NAME` | `MANGO RUSH` |

> `APP_URL` is auto-detected from Railway. **Do NOT add `DEMO_MODE`.**
> `PORT` is set by Railway automatically.
> With `LIBSQL_URL` set, the app keeps an embedded replica on Turso and syncs it every
> second — **data survives every redeploy** even without a volume.

## 5. Finish in Telegram (2 min)

1. Railway gives a URL like `https://mango-rush-production.up.railway.app`.
   Check: open `/api/health` → `{"ok":true,"app":"MANGO RUSH","mode":"production"}`.
2. **BotFather** → `@Mango_Rush0_bot`:
   - **Bot Settings → Menu Button** → URL = your Railway URL
   - **Bot Settings → Commands**: `start - Open MANGO RUSH`, `admin - Admin panel`
   - **Bot Settings → Mini App** → URL = your Railway URL
3. **Add the bot as ADMIN** to all 4 gate channels:
   - `@MangoRush_comminuty`, `@MangoRush_Proof`, `@mangoRush_chat`, `@FreeCryptoHub_1`
   (needed for the join-gate check and withdraw proof posts).

## 6. Test

Open the bot → **Start** → **Open MANGO RUSH** → join channels → **Verify & Continue** →
earn → withdraw (USDT BEP-20, min 0.1) → approve in `/admin` → "Payment Sent" posts to the proof channel.

---

### ⚠️ Before going live
- Do **NOT** set `DEMO_MODE` (it would skip Telegram auth).
- The local `data.db` (your test data) is NOT uploaded; production starts fresh on Turso and
  auto-seeds admins, gate channels and settings on first boot.
- The 2 admin logins work in production too: `Dark_Pixel_0` / `Dark1234`,
  `tharukanavodsudarshana` / `Tharu1234`.
- Turso free tier limits: 100 DBs, 5 GB storage, 500M rows read / 10M rows written per
  month — far beyond what this app needs.
