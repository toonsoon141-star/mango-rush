# 🥭 MANGO RUSH — Telegram Mini App (bot: @Mango_Rush0_bot)

A complete **earning-style Telegram Mini App** — **Node.js + Express + SQLite** backend, vanilla **HTML/CSS/JS** frontend (no build step). Earn Mango coins, convert to USDT and withdraw to a BEP-20 wallet.

## ✨ Features

- 🎬 **Loading screen** + 🚧 **Gate pass** (join 4 channels to enter — auto-verified)
- ⛏️ **Mine** — Mining Machines (Start / Bronze / Silver): watch ads → claim rewards with cooldown + daily limits
- 🎬 **Earn** — Watch & Earn ads (per-ad reward, daily limit) + Daily bonus + Lucky Spin + 7-day Streak + Reward codes
- 📋 **Tasks** — Main Tasks / Partner Tasks / Ad tasks — admin adds them with custom rewards + channel images
- 👥 **Referral system**
  - Friend joins via your link → **+30 Mango instantly** (status: *pending*)
  - Friend watches **20 ads** + completes **5 tasks** → referral becomes *active* → **+70 Mango** (total **100**)
  - **5% commission** on active referrals' earnings, forever
- 💰 **Wallet** — withdraw Mango as **USDT (BEP-20)**: min 0.1 USDT (1000 Mango), fixed 20% fee,
  locked until 20 ads / 5 tasks / 3 referrals are done, **10-hour cooldown** between withdrawals (live countdown)
- 🛡️ **Admin panel** (`/admin`, openable from the bot via `/admin` and from a 🛠️ button inside the mini app) —
  username+password login (only whitelisted admins), 8 tabs: Dashboard, Users, Withdrawals, Tasks, Ads, Broadcast, Promos, Settings
- ⚙️ **Live settings** — every reward/economy value editable from the admin panel (no redeploy needed)
- 📣 **Broadcast** — message everyone who started the bot (text + optional image)
- 🔐 Telegram `initData` verified (HMAC-SHA256) · 💬 bot messages for referrals & withdraw status

## 📁 Structure

```
telegram-airdrop-app/
├── server.js        # Express API + bot long-polling
├── auth.js          # Telegram initData verification
├── db.js            # SQLite data layer (data.db)
├── config.js        # defaults (economy, referral, withdraw, seeds…)
├── settings.js      # runtime settings layer (DB overrides)
├── build.js         # inlines css/js into public/index.html
├── test-auth.js     # auth self-test (node test-auth.js)
├── Dockerfile / railway.json / render.yaml / DEPLOY.md
├── public/
│   ├── index.html   # user app (loading → gate → 6 tabs)
│   ├── style.css    # lime / yellow-green theme
│   ├── app.js       # user frontend logic
│   ├── demo.js      # offline in-memory demo engine
│   └── admin.html   # 🛡️ admin panel
└── .env.example
```

## 🚀 Quick start (local demo)

```bash
cd telegram-airdrop-app
npm install
node server.js
```

- **User app:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin

> **Demo mode** (`DEMO_MODE=1` in `.env`, or no `BOT_TOKEN`): Telegram auth is skipped, a demo
> user is used, and the offline demo engine kicks in if the API is unreachable — so you can click
> through everything. **Remove `DEMO_MODE` for production.**

## 🔧 Production setup (Telegram)

### 1. Bot + Mini App (BotFather)
1. [@BotFather](https://t.me/BotFather) → `/mybots` → `@Mango_Rush0_bot` → copy token → `BOT_TOKEN`
2. Set the **Menu Button** and **Mini App** URL to your deployed HTTPS URL
3. Set bot **commands**: `start - Open MANGO RUSH`, `admin - Admin panel`

### 2. Deploy (HTTPS required)
Render / Railway / VPS — see **`DEPLOY.md`** and **`RAILWAY_QUICKSTART.md`** for step-by-step guides.
Required env vars:

```
BOT_TOKEN=...                       # from BotFather
BOT_USERNAME=Mango_Rush0_bot
APP_SHORT=app
APP_URL=https://...                 # auto-detected on Render/Railway
DB_PATH=/app/data/data.db           # persistent-disk path (production)
WITHDRAW_CHANNEL=@MangoRush_Proof   # withdraw alerts channel (bot must be admin)
MIN_WITHDRAW_USDT=0.1
WITHDRAW_FEE_PCT=20
```

### 3. Gate pass
The 4 channels are seeded automatically on first run (Community, Dev, Payment, Chat — see
`config.GATE_CHANNELS`). Manage them in **Admin → Gate Pass**. The bot must be **admin** in those
channels so joins can be verified.

### 4. Referrals
- Share your link (Referral tab) → friend opens it → **+30 instantly**
- Friend reaches **20 ads + 5 tasks** → **+70** (total 100) + **5% commission** kicks in
- Requirements are configurable live in **Admin → Settings**

### 5. Withdraw (USDT BEP-20)
- Users save a **BEP-20 address** (`0x…`, validated) + enter the **amount in Mango coins**
- **Minimum withdraw**: `0.1 USDT` (= 1000 Mango) · **Fee**: fixed `20%`
- **Unlock requirements**: 20 ads watched, 5 tasks completed, 3 referrals (configurable)
- **Cooldown**: next withdraw only after 10 hours (configurable, live countdown in the wallet)
- Request appears in **Admin → Withdrawals** → **Approve** (admin enters **tax + Tx hash**) posts a
  `💸 Payment Sent` message to the payment channel and notifies the user → **Reject** refunds coins
- All withdraw values are editable live in **Admin → Settings**

### 6. Broadcast
- **Admin panel → Broadcast**, or just **DM the bot** (as admin) — any message becomes a broadcast

## 🔐 Admin access

Only the usernames in `config.ADMIN_SEED` can log in:

| Username | Default password |
|---|---|
| `@Dark_Pixel_0` | `Dark1234` |
| `@tharukanavodsudarshana` | `Tharu1234` |

- Login = **Telegram username + password** (passwords are hashed in the DB)
- **Change your own password** from the admin panel (🔑 Change password)
- Open the panel from Telegram: DM the bot **`/admin`** → "Open Admin Panel" button, or the 🛠️ button in the mini app (admins only)
- ⚠️ **Change both default passwords immediately** after first login

## ⚙️ Settings (everything editable live)

Admin panel → **Settings** — all rewards/economy values can be changed without touching code or redeploying:

- **Daily & Spin**: daily bonus, cooldowns, spin wheel rewards (JSON)
- **Streak**: 7-day streak rewards (JSON)
- **Mining machines**: per-machine reward / ads / cooldown / daily limit (JSON)
- **Referral**: instant reward, active reward, ads-to-activate, tasks-to-activate, commission %
- **Withdraw**: Mango→USDT rate, minimum withdraw, fee %, cooldown hours, unlock requirements, alert channel

## 🔐 Security

- Every mini-app request is verified via Telegram `initData` (HMAC-SHA256) — `node test-auth.js` (7 checks)
- Admin routes need a bearer session token (login = Telegram username + password)
- Bot only messages users who have started the bot (Telegram rule)

## 🗄️ Database & persistence

By default the DB is a local SQLite file (`data.db`, or `DB_PATH`). On hosts with ephemeral
disks (Railway free plan, Render free, Fly without a volume) that file is wiped on redeploy.

To keep data safe for free, point the app at **Turso** (free tier, SQLite-compatible):

```
LIBSQL_URL=libsql://<db-name>-<org>.turso.io
LIBSQL_AUTH_TOKEN=<token from Turso dashboard/CLI>
```

With those set, the local file becomes an **embedded replica** that auto-syncs with Turso
(default every 1s, configurable via `LIBSQL_SYNC_PERIOD`), and pulls the latest snapshot on
boot — so users + balances survive every redeploy with no persistent disk needed.

## 📝 Notes

- Gate pass & channel-membership checks need `BOT_TOKEN` + the bot as admin of those channels
- Withdraw payouts are **manual** (you send the crypto); the app tracks requests, tax and status
- Single-instance only (SQLite single-writer model) — don't scale to multiple replicas without a rewrite
