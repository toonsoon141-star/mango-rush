// ============================================================
//  SETTINGS LAYER  —  runtime-configurable from the admin panel
//  Defaults come from config.js; overrides live in the DB.
// ============================================================

const config = require('./config');
const dbmod = require('./db');

// keys + their default values (type inferred from the default)
const DEFAULTS = {
  // daily & spin
  daily_bonus: config.DAILY_BONUS,
  daily_cooldown_hours: Math.round(config.DAILY_COOLDOWN_MS / 3600000),
  spin_cooldown_hours: Math.round(config.SPIN_COOLDOWN_MS / 3600000),
  spin_rewards: config.SPIN_REWARDS, // array of {points, weight}

  // referral
  ref_instant: config.REFERRAL_INSTANT_REWARD,
  ref_active: config.REFERRAL_ACTIVE_REWARD,
  ref_ads_target: config.REFERRAL_ACTIVE_ADS,
  ref_tasks_target: config.REFERRAL_ACTIVE_TASKS,
  ref_commission_pct: Math.round(config.REFERRAL_COMMISSION * 100),

  // withdraw
  mango_to_usdt: config.MANGO_TO_USDT,
  min_withdraw_usdt: config.MIN_WITHDRAW_USDT,
  withdraw_fee_pct: config.WITHDRAW_FEE_PCT,
  withdraw_channel: config.WITHDRAW_CHANNEL,
  withdraw_ads_required: 20,
  withdraw_tasks_required: 5,
  withdraw_referrals_required: 3,
  withdraw_cooldown_hours: 10,

  // streak
  streak_rewards: config.STREAK_REWARDS,

  // mining machines
  mining_machines: config.MINING_MACHINES,
};

function coerce(key, raw) {
  const d = DEFAULTS[key];
  if (Array.isArray(d)) {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : d; } catch { return d; }
  }
  if (typeof d === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : d;
  }
  return String(raw);
}

function all() {
  const merged = { ...DEFAULTS };
  for (const row of dbmod.getSettingsRaw()) {
    if (!(row.key in DEFAULTS)) continue;
    merged[row.key] = coerce(row.key, row.value);
  }
  return merged;
}

function defaults() {
  return { ...DEFAULTS };
}

function get(key) {
  return all()[key];
}

/** Accepts an object of key -> value; validates + persists. */
function update(partial) {
  const updated = {};
  for (const [k, v] of Object.entries(partial)) {
    if (!(k in DEFAULTS)) continue;
    let stored;
    const d = DEFAULTS[k];
    if (Array.isArray(d)) {
      const arr = Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return null; } })();
      if (!Array.isArray(arr)) continue;
      stored = JSON.stringify(arr);
    } else if (typeof d === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      stored = String(n);
    } else {
      stored = String(v);
    }
    dbmod.setSetting(k, stored);
    updated[k] = v;
  }
  return all();
}

module.exports = { all, get, update, defaults };
