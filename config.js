// ============================================================
//  APP CONFIG  —  identity + DEFAULT values.
//  ⚙️ Rewards / economy values are set here as defaults, but
//     can be changed at runtime from the admin panel (Settings).
// ============================================================

require('dotenv').config();

module.exports = {
  // ---- Bot / App identity ----
  // DEMO_MODE=1 forces demo behaviour (skips Telegram initData verification)
  // even when a BOT_TOKEN is present — useful for local preview. Set 0 / remove for production.
  BOT_TOKEN: process.env.DEMO_MODE === '1' ? '' : (process.env.BOT_TOKEN || ''),
  BOT_USERNAME: process.env.BOT_USERNAME || 'Mango_Rush0_bot',
  APP_NAME: process.env.APP_NAME || 'MANGO RUSH',

  // ---- Web app URL ----
  // Set APP_URL explicitly, or it auto-detects on Render / Railway.
  APP_URL: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || '',
  APP_SHORT: process.env.APP_SHORT || 'app',

  PORT: process.env.PORT || 3000,

  // ---- Admins (username + password) ----
  // ⚠️ These accounts are seeded on first run (passwords stored hashed).
  //    Login uses Telegram username + password. Password can be changed from the panel.
  //    The username itself is checked — anyone not in this list cannot enter the panel.
  ADMIN_SEED: [
    { username: 'Dark_Pixel_0', display_name: '@Dark_Pixel_0', password: 'Dark1234' },
    { username: 'tharukanavodsudarshana', display_name: '@tharukanavodsudarshana', password: 'Tharu1234' },
  ],

  // ---- Withdraw label / currency ----
  WITHDRAW_CURRENCY: 'USDT',
  WITHDRAW_ADDRESS_LABEL: process.env.WITHDRAW_ADDRESS_LABEL || 'USDT (BEP-20) address',

  // ============================================================
  //  DEFAULT economy values (admin panel Settings override these)
  // ============================================================
  DAILY_BONUS: 500,
  DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1000,

  // ---- Streak (Home) ----
  STREAK_REWARDS: [10, 10, 10, 10, 10, 10, 10],  // per-day reward (7-day cycle)

  // ---- Mining machines (Mine tab) ----
  // watch `ads` count → claim `reward` Mango, `cooldown_hours` cooldown, `per_day` claims/day
  MINING_MACHINES: [
    { id: 'start',  name: 'Start',  reward: 5,  ads: 1, per_day: 10, cooldown_hours: 1, icon: '🔧', color: '#a3e635' },
    { id: 'bronze', name: 'Bronze', reward: 10, ads: 2, per_day: 10, cooldown_hours: 1, icon: '🥉', color: '#cd7f32' },
    { id: 'silver', name: 'Silver', reward: 20, ads: 3, per_day: 10, cooldown_hours: 1, icon: '🥈', color: '#c0c0c0' },
  ],

  // ---- Reward codes (seed — add more from the admin panel) ----
  SEED_REWARD_CODES: [
    { code: 'MANGO100', reward: 100 },
  ],

  REFERRAL_INSTANT_REWARD: 30,
  REFERRAL_ACTIVE_REWARD: 70,
  REFERRAL_ACTIVE_ADS: 20,
  REFERRAL_ACTIVE_TASKS: 5,
  REFERRAL_COMMISSION: 0.05, // 5%

  MANGO_TO_USDT: 0.0001,     // 100 Mango = 0.01 USDT  =>  0.1 USDT = 1000 Mango
  MIN_WITHDRAW_USDT: 0.1,    // minimum withdraw (USDT) = 1000 coins
  WITHDRAW_FEE_PCT: 20,      // withdraw fee % (fixed)
  WITHDRAW_CHANNEL: process.env.WITHDRAW_CHANNEL || '@MangoRush_Proof',

  // ---- Gate pass (seed) ----
  GATE_CHANNELS: [
    { title: 'Goom', channel: '@goom123456', url: 'https://t.me/goom123456' },
    { title: 'Cool Products', channel: '@bestcoolpro', url: 'https://t.me/bestcoolpro' },
    { title: 'Crypto News', channel: '@cryptonewsinus', url: 'https://t.me/cryptonewsinus' },
    { title: 'Free Crypto Hub', channel: '@FreeCryptoHub_1', url: 'https://t.me/FreeCryptoHub_1' },
  ],

  // ---- Default tasks (seed) ----
  SEED_TASKS: [
    {
      category: 'main', type: 'channel',
      title: 'Join our Community', desc: 'Join our community channel',
      reward: 500, channel: '@FreeCryptoHub_1', url: 'https://t.me/FreeCryptoHub_1',
    },
    {
      category: 'main', type: 'link',
      title: 'Follow us on X (Twitter)', desc: 'Follow our X (Twitter) account',
      reward: 300, url: 'https://x.com/mangorush',
    },
    {
      category: 'partner', type: 'link',
      title: 'Partner: Visit site', desc: 'Visit our partner site',
      reward: 200, url: 'https://example.com',
    },
    {
      category: 'ads', type: 'ads',
      title: 'Watch Ad', desc: 'Watch an ad to earn coins (repeatable)',
      reward: 5, url: 'https://t.me/FreeCryptoHub_1',
    },
  ],
};
