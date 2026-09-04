// ============================================================
//  MANGO RUSH 🥭  —  Telegram Mini App
//  Node.js + Express + SQLite
//  Mining machines · watch & earn · tasks · gate pass · referrals (30/70 + 5% commission)
//  Main/Partner/Ads tasks · USDT withdraw + tax · broadcast
//  Username-based admins · runtime settings (admin panel)
// ============================================================

const path = require('path');
const crypto = require('crypto');
const express = require('express');

const config = require('./config');
const dbmod = require('./db');
const settings = require('./settings');
const { verifyInitData } = require('./auth');

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// /admin shortcut → admin panel (used by the bot's "Open Admin Panel" button)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ============================================================
//  SEED DATA (first run)
// ============================================================

function seed() {
  for (const a of config.ADMIN_SEED) {
    dbmod.seedAdmin(a.username, a.display_name, a.password);
  }
  // Migration: if the DB still holds an older set of gate channels,
  // replace them with the current set (config.GATE_CHANNELS).
  const LEGACY_GATE = ['@goom123456', '@bestcoolpro', '@cryptonewsinus'];
  const existingGate = dbmod.listGateChannelsAll().map((c) => c.channel);
  if (existingGate.some((ch) => LEGACY_GATE.includes(ch))) {
    dbmod.deleteAllGateChannels();
    for (const [i, c] of config.GATE_CHANNELS.entries()) {
      dbmod.addGateChannel({ title: c.title, channel: c.channel, url: c.url, sort: i });
    }
    // Repoint tasks that referenced the community channel during the previous set.
    dbmod.repointTaskChannel('@FreeCryptoHub_1', '@MangoRush_comminuty', 'https://t.me/MangoRush_comminuty');
    console.log('♻️  Migrated gate channels to the current set');
  } else if (dbmod.countGateChannels() === 0) {
    for (const [i, c] of config.GATE_CHANNELS.entries()) {
      dbmod.addGateChannel({ title: c.title, channel: c.channel, url: c.url, sort: i });
    }
    console.log('🚧 Seeded', config.GATE_CHANNELS.length, 'gate channels');
  }
  if (dbmod.countTasksInDB() === 0) {
    for (const [i, t] of config.SEED_TASKS.entries()) {
      dbmod.addTask({ category: t.category, type: t.type, title: t.title, desc: t.desc, reward: t.reward, url: t.url, channel: t.channel, sort: i });
    }
    console.log('📋 Seeded', config.SEED_TASKS.length, 'tasks');
  }
  if (dbmod.listRewardCodes().length === 0) {
    for (const rc of config.SEED_REWARD_CODES) {
      dbmod.createRewardCode(rc.code, rc.reward, rc.max_uses || 0);
    }
    console.log('🎁 Seeded', config.SEED_REWARD_CODES.length, 'reward codes');
  }
  if (dbmod.countAds() === 0) {
    for (const [i, a] of config.SEED_ADS.entries()) {
      dbmod.addAd({ name: a.name, image: a.image || null, reward: a.reward, daily_limit: a.daily_limit, block_id: a.block_id || null, sort: i });
    }
    console.log('📺 Seeded', config.SEED_ADS.length, 'watch & earn ads');
  }

  const admins = dbmod.listAdmins();
  console.log('👑 Admins:', admins.map((a) => a.display_name).join(', ') || 'none');
}

// ============================================================
//  ADMIN SESSIONS
// ============================================================

const sessions = new Map(); // token -> { username, expires }
const SESSION_TTL = 24 * 60 * 60 * 1000;

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
  return token;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const s = token && sessions.get(token);
  if (!s) return res.status(401).json({ error: 'Unauthorized' });
  if (Date.now() > s.expires) { sessions.delete(token); return res.status(401).json({ error: 'Session expired' }); }
  req.adminUsername = s.username;
  next();
}

// ============================================================
//  AUTH (users)
// ============================================================

const DEMO_USER = { id: 0, username: 'demo', first_name: 'Demo User' };

function resolveUser(req) {
  const initData =
    (req.body && req.body.initData) ||
    (req.query && req.query.initData) ||
    (req.headers['x-telegram-init-data']);
  const verified = verifyInitData(initData, config.BOT_TOKEN);

  if (config.BOT_TOKEN) {
    if (!verified || !verified.user) {
      // diagnostic: record WHY the gate/auth failed (no initData vs bad signature)
      try {
        const raw = String(initData || '');
        const { diagnoseInitData } = require('./auth');
        const d = diagnoseInitData(raw, config.BOT_TOKEN);
        let decoded = null;
        const m = raw.match(/(?:^|&)user=([^&]*)/);
        if (m) { try { decoded = JSON.parse(decodeURIComponent(m[1])); } catch (e) { /* ignore */ } }
        const detail = (raw.length
          ? 'bad_initData(len=' + raw.length + ') reason=' + d.reason + ' has_signature=' + d.has_signature + ' fields=' + (d.fields || []).join(',') +
            (decoded ? ' user=' + (decoded.id || '?') + ' @' + (decoded.username || '-') : ' no-user-field')
          : 'no_initData');
        // keep the raw string for definitive diagnosis (replayable only within auth window)
        dbmod.logGateAttempt(decoded ? decoded.id : null, decoded ? decoded.username : null, false, detail + ' ||RAW=' + raw.slice(0, 900));
        console.log(`[auth] 401 — ${detail}`);
      } catch (e) { /* ignore */ }
      const err = new Error('Invalid Telegram initData');
      err.status = 401;
      throw err;
    }
    return resolveReferral(verified);
  }

  if (verified && verified.user) return resolveReferral(verified);
  const isDemo = (req.body && req.body.demo) || (req.query && req.query.demo);
  if (isDemo) {
    const demoId = parseInt((req.body && req.body.demo_id) || (req.query && req.query.demo_id), 10);
    const demoUser = demoId && demoId > 0
      ? { id: demoId, username: 'demo' + demoId, first_name: 'Demo ' + demoId }
      : DEMO_USER;
    const startParam = (req.body && req.body.start_param) || (req.query && req.query.start_param) || null;
    let referredBy = null;
    if (startParam && startParam.startsWith('ref_')) {
      const refId = parseInt(startParam.slice(4), 10);
      if (Number.isFinite(refId) && refId > 0) referredBy = refId;
    }
    return { telegramUser: demoUser, startParam, referredBy };
  }
  return { telegramUser: DEMO_USER, startParam: null };
}

function resolveReferral(verified) {
  let referredBy = null;
  const sp = verified.startParam;
  if (sp && sp.startsWith('ref_')) {
    const refId = parseInt(sp.slice(4), 10);
    if (Number.isFinite(refId) && refId > 0) referredBy = refId;
  }
  if (sp) console.log(`[ref] start_param='${sp}' user=${verified.user && verified.user.id} -> referredBy=${referredBy}`);
  return { telegramUser: verified.user, startParam: verified.startParam, referredBy };
}

function grantReferral(user, referredBy) {
  // honour a referred_by stored at user creation even if this request has no param
  referredBy = referredBy || user.referred_by;
  if (!referredBy || referredBy === user.id) return;
  // already rewarded → nothing to do (referral row is created exactly once)
  if (dbmod.getReferralForUser(user.id)) return;
  const referrer = dbmod.getUser(referredBy);
  if (!referrer) { console.log(`[ref] user ${user.id} referred by ${referredBy} — referrer not found in DB, skipping`); return; }
  console.log(`[ref] granting: user ${user.id} referred by ${referredBy} (+${settings.get('ref_instant')})`);
  const instant = settings.get('ref_instant');
  dbmod.updateUserFields(user.id, { referred_by: referredBy });
  dbmod.createReferral(referredBy, user.id);
  dbmod.setReferralInstant(user.id, instant);
  dbmod.addPoints(referredBy, instant);
  dbmod.updateUserFields(referredBy, { referrals: (referrer.referrals || 0) + 1 });
  notify(referredBy,
    `🎉 New referral joined!\n\n👤 ${user.first_name || user.username || user.id}\n💰 You earned +${instant} Mango (instant).\n\nWhen they watch ${settings.get('ref_ads_target')} ads + complete ${settings.get('ref_tasks_target')} tasks, you'll get +${settings.get('ref_active')} more!`);
}

function authedUser(req) {
  const { telegramUser, referredBy } = resolveUser(req);
  if (dbmod.isUserBanned(telegramUser.id)) {
    const err = new Error('You are suspended');
    err.status = 403;
    throw err;
  }
  const user = dbmod.getUserOrCreate(telegramUser, referredBy);
  grantReferral(user, referredBy);
  return user;
}

// ============================================================
//  ECONOMY HELPERS
// ============================================================

const usdtToCoins = (usdt) => Math.round(usdt / settings.get('mango_to_usdt'));
const coinsToUsdt = (coins) => Math.round(coins * settings.get('mango_to_usdt') * 10000) / 10000;

function creditCommission(userId, amount) {
  const ref = dbmod.getReferralForUser(userId);
  if (!ref || ref.status !== 'active') return;
  const comm = Math.floor(amount * (settings.get('ref_commission_pct') / 100));
  if (comm > 0) {
    dbmod.addPoints(ref.referrer_id, comm);
    dbmod.incCounter(ref.referrer_id, 'commission_earned', comm);
    trackEarn(ref.referrer_id, comm);
  }
}

function trackEarn(userId, amount) {
  const today = new Date().toISOString().slice(0, 10);
  const u = dbmod.getUser(userId);
  if (!u) return;
  if (u.today_date !== today) {
    dbmod.updateUserFields(userId, { today_earned: amount, today_date: today });
  } else {
    dbmod.incCounter(userId, 'today_earned', amount);
  }
}

function grant(userId, amount) {
  dbmod.addPoints(userId, amount);
  trackEarn(userId, amount);
  creditCommission(userId, amount);
}

function checkActivation(userId) {
  const ref = dbmod.getReferralForUser(userId);
  if (!ref || ref.status !== 'pending') return;
  const u = dbmod.getUser(userId);
  if (u.ads_watched >= settings.get('ref_ads_target') && u.tasks_completed >= settings.get('ref_tasks_target')) {
    const activeReward = settings.get('ref_active');
    dbmod.setReferralActive(userId, activeReward);
    dbmod.addPoints(ref.referrer_id, activeReward);
    notify(ref.referrer_id,
      `✅ Referral activated!\n\n👤 ${u.first_name || u.username || u.id} completed the requirements.\n💰 You earned +${activeReward} Mango (total ${settings.get('ref_instant') + activeReward} for this referral).\n\n${settings.get('ref_commission_pct')}% commission on their earnings is now active! 🚀`);
  }
}

// ============================================================
//  TELEGRAM BOT API
// ============================================================

async function tgApi(method, params) {
  const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function sendMessage(chatId, text, replyMarkup) {
  if (!config.BOT_TOKEN) return false;
  try {
    const r = await tgApi('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
    return r.ok;
  } catch { return false; }
}

async function sendPhoto(chatId, photoDataUrl, caption) {
  if (!config.BOT_TOKEN) return false;
  try {
    const m = String(photoDataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return false;
    const buf = Buffer.from(m[2], 'base64');
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([buf], { type: m[1] }), 'photo.jpg');
    if (caption) form.append('caption', caption);
    const r = await fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
    const j = await r.json();
    return !!j.ok;
  } catch { return false; }
}

function notify(chatId, text) {
  if (!config.BOT_TOKEN || !chatId) return;
  sendMessage(chatId, text).catch(() => {});
}

async function isMember(chatId, userId) {
  const r = await isMemberStatus(chatId, userId);
  return r.joined;
}

async function isMemberStatus(chatId, userId) {
  if (!config.BOT_TOKEN) return { joined: false, status: 'no_token' };
  try {
    const r = await tgApi('getChatMember', { chat_id: chatId, user_id: userId });
    if (!r.ok) {
      return { joined: false, status: 'error', detail: r.description || '' };
    }
    const status = r.result && r.result.status;
    return { joined: ['member', 'administrator', 'creator'].includes(status), status };
  } catch (e) {
    return { joined: false, status: 'error', detail: e.message };
  }
}

// ============================================================
//  PUBLIC PROFILE
// ============================================================

function publicUser(user) {
  const myRef = dbmod.getReferralForUser(user.id);
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    photo_url: user.photo_url || '',
    is_admin: dbmod.isAdminUsername(user.username || ''),
    points: user.points,
    referrals: user.referrals,
    last_daily_ts: user.last_daily_ts,
    daily_cooldown_ms: settings.get('daily_cooldown_hours') * 3600000,
    daily_bonus: settings.get('daily_bonus'),
    app_name: config.APP_NAME,
    reward_per_referral: settings.get('ref_instant') + settings.get('ref_active'),
    instant_reward: settings.get('ref_instant'),
    active_reward: settings.get('ref_active'),
    commission_pct: settings.get('ref_commission_pct'),
    ads_watched: user.ads_watched || 0,
    tasks_completed: user.tasks_completed || 0,
    ads_target: settings.get('ref_ads_target'),
    tasks_target: settings.get('ref_tasks_target'),
    my_referral_status: myRef ? myRef.status : null,
    wallet_address: user.wallet_address || '',
    min_withdraw_usdt: settings.get('min_withdraw_usdt'),
    min_withdraw_coins: usdtToCoins(settings.get('min_withdraw_usdt')),
    withdraw_fee_pct: settings.get('withdraw_fee_pct'),
    mango_to_usdt: settings.get('mango_to_usdt'),
    withdraw_currency: config.WITHDRAW_CURRENCY,
    streak_count: user.streak_count || 0,
    streak_date: user.streak_date || '',
    streak_rewards: settings.get('streak_rewards'),
    today_earned: user.today_earned || 0,
  };
}

// ============================================================
//  ROUTES — mini app
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true, app: config.APP_NAME, mode: config.BOT_TOKEN ? 'production' : 'demo',
    version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  });
});

app.post('/api/auth', (req, res) => {
  const user = authedUser(req);
  checkActivation(user.id);
  res.json({ user: publicUser(dbmod.getUser(user.id)) });
});

// ============================================================
//  IMAGE SERVING (bandwidth optimization)
//  Uploaded images are stored as base64 data-URLs in the DB.
//  Instead of embedding them in every API response (heavy!),
//  we hand out tiny /img/... URLs served with long-lived cache
//  headers, so each browser downloads an image only once.
// ============================================================

function imgHash(data) {
  return crypto.createHash('md5').update(String(data)).digest('hex').slice(0, 10);
}

// Turn a stored image (data URL) into a cacheable URL; pass through
// plain paths/URLs (e.g. /adsgram-logo.png) untouched.
function imgRef(kind, id, data) {
  if (!data) return data;
  if (!String(data).startsWith('data:')) return data;
  return `/img/${kind}/${encodeURIComponent(id)}?v=${imgHash(data)}`;
}

function serveImg(res, data) {
  const m = String(data || '').match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) return res.status(404).end();
  const buf = Buffer.from(m[2], 'base64');
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(buf);
}

app.get('/img/task/:id', (req, res) => {
  const t = dbmod.getTask(parseInt(req.params.id, 10));
  serveImg(res, t && t.image);
});
app.get('/img/ad/:id', (req, res) => {
  const a = dbmod.getAd(parseInt(req.params.id, 10));
  serveImg(res, a && a.image);
});
app.get('/img/gate/:id', (req, res) => {
  const c = dbmod.listGateChannelsAll().find((x) => x.id === parseInt(req.params.id, 10));
  serveImg(res, c && c.image);
});
app.get('/img/machine/:id', (req, res) => {
  const machines = settings.get('mining_machines') || [];
  const m = machines.find((x) => String(x.id) === String(req.params.id));
  serveImg(res, m && m.image);
});

// --- Gate pass ---
// Membership results are cached for 2 minutes per user+channel to cut
// Telegram API traffic. ?fresh=1 (the "Check again" button) skips the cache.
const _gateCache = new Map(); // `${userId}:${channel}` -> { r, ts }
const GATE_CACHE_MS = 2 * 60 * 1000;

async function isMemberCached(channel, userId, fresh) {
  const key = `${userId}:${channel}`;
  const hit = _gateCache.get(key);
  if (!fresh && hit && Date.now() - hit.ts < GATE_CACHE_MS) return hit.r;
  const r = await isMemberStatus(channel, userId);
  // never cache errors; cache "joined" longer than "not joined" is not needed — keep it simple
  if (r.status !== 'error') _gateCache.set(key, { r, ts: Date.now() });
  if (_gateCache.size > 20000) _gateCache.clear(); // memory safety valve
  return r;
}

app.get('/api/gate', async (req, res) => {
  const user = authedUser(req);
  const demo = !config.BOT_TOKEN;
  const fresh = req.query.fresh === '1';
  const channels = dbmod.listGateChannels();
  let passed = true;
  const list = await Promise.all(
    channels.map(async (c) => {
      let joined = true;
      let status = 'member';
      if (!demo) {
        const r = await isMemberCached(c.channel, user.id, fresh);
        joined = r.joined;
        status = r.status;
        console.log(`[gate] user=${user.id} channel=${c.channel} -> joined=${joined} status=${status}${r.detail ? ' (' + r.detail + ')' : ''}`);
      }
      if (!joined) passed = false;
      return { id: c.id, title: c.title, channel: c.channel, url: c.url, image: imgRef('gate', c.id, c.image), joined, status };
    })
  );
  if (demo) passed = false;
  // diagnostic log — lets admins see exactly what happened on each attempt
  const detail = list.map((c) => `${c.channel.replace(/^@/, '')}:${c.joined ? 'ok' : (c.status || 'fail')}`).join(', ');
  dbmod.logGateAttempt(user.id, user.username, passed, detail);
  res.json({ passed, demo, channels: list, app_name: config.APP_NAME, bot_username: config.BOT_USERNAME });
});

// --- Daily bonus ---
app.post('/api/claim-daily', (req, res) => {
  const user = authedUser(req);
  const now = Date.now();
  const cooldown = settings.get('daily_cooldown_hours') * 3600000;
  const elapsed = now - (user.last_daily_ts || 0);
  if (elapsed < cooldown) {
    return res.status(400).json({ error: 'Daily bonus already claimed', retry_in_ms: cooldown - elapsed });
  }
  dbmod.updateUserFields(user.id, { last_daily_ts: now });
  grant(user.id, settings.get('daily_bonus'));
  res.json({ user: publicUser(dbmod.getUser(user.id)), bonus: settings.get('daily_bonus') });
});

// --- Streak (Home) ---
app.post('/api/claim-streak', (req, res) => {
  const user = authedUser(req);
  const today = new Date().toISOString().slice(0, 10);

  if (user.streak_date === today) {
    return res.status(400).json({ error: 'Streak already claimed today' });
  }

  // yesterday?
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const count = user.streak_date === yesterday ? (user.streak_count + 1) : 1;

  const rewards = settings.get('streak_rewards') || [];
  const reward = rewards[(count - 1) % rewards.length] || 0;

  dbmod.updateUserFields(user.id, { streak_count: count, streak_date: today });
  grant(user.id, reward);

  res.json({
    ok: true,
    streak_count: count,
    reward,
    user: publicUser(dbmod.getUser(user.id)),
  });
});

// --- Reward codes ---
app.post('/api/reward-code', (req, res) => {
  const user = authedUser(req);
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Enter a code' });

  const rc = dbmod.getRewardCode(code);
  if (!rc || !rc.active) return res.status(404).json({ error: 'Invalid code' });
  if (rc.max_uses > 0 && rc.used >= rc.max_uses) return res.status(400).json({ error: 'This code is fully used' });
  if (dbmod.hasRewardCodeClaimed(user.id, rc.id)) return res.status(400).json({ error: 'You already used this code' });

  dbmod.claimRewardCode(user.id, rc.id);
  grant(user.id, rc.reward);

  res.json({ ok: true, reward: rc.reward, user: publicUser(dbmod.getUser(user.id)) });
});

// --- Mining machines (Mine) ---
// Flow: watch `ads` ads (15s between each) → claim `reward` Mango →
//       1h cooldown before the next cycle · `per_day` claims/day.
function machineView(m, mc, today) {
  const claimsToday = (mc && mc.claim_date === today) ? mc.claims_today : 0;
  const lastTs = mc ? mc.last_claim_ts : 0;
  const cooldownMs = (m.cooldown_hours || 1) * 3600000;
  const remainingMs = Math.max(0, (lastTs + cooldownMs) - Date.now());

  const adsNeeded = m.ads || 1;
  const adsDone = Math.min(mc ? (mc.ads_progress || 0) : 0, adsNeeded);
  const adCdMs = (m.ad_cooldown_sec || 15) * 1000;
  const adCdRemaining = Math.max(0, (mc ? (mc.last_ad_ts || 0) : 0) + adCdMs - Date.now());

  const remainingToday = Math.max(0, (m.per_day || 0) - claimsToday);
  const cooldownReady = remainingMs <= 0;

  return {
    ...m,
    ads: adsNeeded,
    ad_cooldown_sec: m.ad_cooldown_sec || 15,
    claims_today: claimsToday,
    remaining_today: remainingToday,
    cooldown_ready: cooldownReady,
    cooldown_remaining_ms: remainingMs,
    ads_done: adsDone,
    ad_cooldown_remaining_ms: adCdRemaining,
    can_watch: cooldownReady && remainingToday > 0 && adsDone < adsNeeded && adCdRemaining <= 0,
    claim_ready: adsDone >= adsNeeded && cooldownReady && remainingToday > 0,
  };
}

app.get('/api/machines', (req, res) => {
  const user = authedUser(req);
  const machines = settings.get('mining_machines') || [];
  const today = new Date().toISOString().slice(0, 10);
  const list = machines.map((m) => {
    const v = machineView(m, dbmod.getMachineClaim(user.id, m.id), today);
    v.image = imgRef('machine', m.id, m.image);
    return v;
  });
  res.json({ machines: list, user: publicUser(user) });
});

// Watch ONE ad toward a machine's requirement (15s cooldown between ads).
app.post('/api/machines/:id/watch', (req, res) => {
  const user = authedUser(req);
  const machines = settings.get('mining_machines') || [];
  const m = machines.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Machine not found' });

  const today = new Date().toISOString().slice(0, 10);
  const mc = dbmod.getMachineClaim(user.id, m.id);
  const v = machineView(m, mc, today);

  if (v.remaining_today <= 0) {
    return res.status(400).json({ error: 'Daily limit reached for this machine' });
  }
  if (!v.cooldown_ready) {
    const waitMin = Math.ceil(v.cooldown_remaining_ms / 60000);
    return res.status(400).json({ error: `Cooldown — wait ~${waitMin} min` });
  }
  if (v.ads_done >= v.ads) {
    return res.status(400).json({ error: 'All ads watched — claim your reward' });
  }
  if (v.ad_cooldown_remaining_ms > 0) {
    return res.status(400).json({
      error: `Wait ${Math.ceil(v.ad_cooldown_remaining_ms / 1000)}s before the next ad`,
      retry_in_ms: v.ad_cooldown_remaining_ms,
    });
  }

  dbmod.updateMachineWatch(user.id, m.id, v.ads_done + 1, Date.now());
  dbmod.incCounter(user.id, 'ads_watched', 1);
  checkActivation(user.id);

  const fresh = dbmod.getUser(user.id);
  const mv = machineView(m, dbmod.getMachineClaim(user.id, m.id), today);
  res.json({ ok: true, ads_done: mv.ads_done, ads_needed: mv.ads, machine: mv, user: publicUser(fresh) });
});

app.post('/api/machines/:id/claim', (req, res) => {
  const user = authedUser(req);
  const machines = settings.get('mining_machines') || [];
  const m = machines.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Machine not found' });

  const today = new Date().toISOString().slice(0, 10);
  const mc = dbmod.getMachineClaim(user.id, m.id);
  const v = machineView(m, mc, today);

  if (v.remaining_today <= 0) {
    return res.status(400).json({ error: 'Daily limit reached for this machine' });
  }
  if (!v.cooldown_ready) {
    const waitMin = Math.ceil(v.cooldown_remaining_ms / 60000);
    return res.status(400).json({ error: `Cooldown — wait ~${waitMin} min` });
  }
  if (v.ads_done < v.ads) {
    return res.status(400).json({
      error: `Watch all ${v.ads} ads to claim (${v.ads_done}/${v.ads} watched)`,
      ads_done: v.ads_done,
      ads_needed: v.ads,
    });
  }

  dbmod.updateMachineClaim(user.id, m.id, today, v.claims_today + 1, Date.now());
  grant(user.id, m.reward);
  const fresh = dbmod.getUser(user.id);
  checkActivation(user.id);

  res.json({ ok: true, reward: m.reward, ads: m.ads, user: publicUser(fresh) });
});

// --- Ads (watch & earn offers) ---
app.get('/api/ads', (req, res) => {
  const user = authedUser(req);
  const today = new Date().toISOString().slice(0, 10);
  const ads = dbmod.listAds().map((a) => {
    const claim = dbmod.getAdClaim(user.id, a.id);
    const claimedToday = (claim && claim.claim_date === today) ? claim.claims_today : 0;
    return {
      id: a.id, name: a.name, image: imgRef('ad', a.id, a.image), reward: a.reward,
      daily_limit: a.daily_limit, block_id: a.block_id,
      claimed_today: claimedToday,
      remaining_today: Math.max(0, (a.daily_limit || 0) - claimedToday),
    };
  });
  res.json({ ads, user: publicUser(user) });
});

app.post('/api/ads/:id/claim', (req, res) => {
  const user = authedUser(req);
  const ad = dbmod.getAd(parseInt(req.params.id, 10));
  if (!ad || !ad.active) return res.status(404).json({ error: 'Ad not found' });

  const today = new Date().toISOString().slice(0, 10);
  const claim = dbmod.getAdClaim(user.id, ad.id);
  const claimedToday = (claim && claim.claim_date === today) ? claim.claims_today : 0;
  if (claimedToday >= (ad.daily_limit || 0)) {
    return res.status(400).json({ error: 'Daily limit reached for this ad' });
  }

  dbmod.updateAdClaim(user.id, ad.id, today, claimedToday + 1);
  dbmod.incCounter(user.id, 'ads_watched', 1);
  grant(user.id, ad.reward);
  const fresh = dbmod.getUser(user.id);
  checkActivation(user.id);

  res.json({ ok: true, reward: ad.reward, user: publicUser(fresh) });
});

// --- Tasks (DB) ---
app.get('/api/tasks', async (req, res) => {
  const user = authedUser(req);
  const all = dbmod.listTasks();

  const decorate = async (t) => {
    const claimed = dbmod.hasClaimed(user.id, String(t.id));
    let completed = claimed;
    if (t.type === 'channel' && config.BOT_TOKEN) {
      completed = claimed || (await isMember(t.channel, user.id));
    }
    return {
      id: t.id, category: t.category, type: t.type,
      title: t.title, desc: t.desc, reward: t.reward,
      url: t.url || null, channel: t.channel || null,
      image: imgRef('task', t.id, t.image) || null,
      completed, claimed,
    };
  };

  const main = [], partner = [], ads = [];
  for (const t of all) {
    const d = await decorate(t);
    if (t.category === 'ads') ads.push(d);
    else if (t.category === 'partner') partner.push(d);
    else main.push(d);
  }

  res.json({ main, partner, ads, user: publicUser(user) });
});

app.post('/api/tasks/:id/claim', async (req, res) => {
  const user = authedUser(req);
  const task = dbmod.getTask(parseInt(req.params.id, 10));
  if (!task || !task.active) return res.status(404).json({ error: 'Task not found' });

  if (task.type === 'ads') {
    dbmod.incCounter(user.id, 'ads_watched', 1);
    grant(user.id, task.reward);
    const fresh = dbmod.getUser(user.id);
    checkActivation(user.id);
    return res.json({ ok: true, user: publicUser(fresh), reward: task.reward, ads_watched: fresh.ads_watched });
  }

  if (dbmod.hasClaimed(user.id, String(task.id))) return res.status(400).json({ error: 'Already claimed' });

  if (task.type === 'channel') {
    if (!config.BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN required to verify channel membership' });
    if (!(await isMember(task.channel, user.id))) {
      return res.status(400).json({ error: 'You are not a member of ' + task.channel });
    }
  }

  dbmod.claimTask(user.id, String(task.id));
  dbmod.incCounter(user.id, 'tasks_completed', 1);
  grant(user.id, task.reward);
  const fresh = dbmod.getUser(user.id);
  checkActivation(user.id);
  res.json({ ok: true, user: publicUser(fresh), reward: task.reward });
});

// --- Referral ---
app.get('/api/referral', (req, res) => {
  const user = authedUser(req);
  const link = config.BOT_USERNAME
    ? `https://t.me/${config.BOT_USERNAME}?start=ref_${user.id}`
    : null;

  const refs = dbmod.listReferrals(user.id);
  const activeCount = dbmod.countReferrals(user.id, 'active');

  let instant = 0, active = 0;
  for (const r of refs) { instant += r.instant_reward || 0; active += r.active_reward || 0; }

  res.json({
    link,
    bot_username: config.BOT_USERNAME,
    instant_reward: settings.get('ref_instant'),
    active_reward: settings.get('ref_active'),
    total_per_referral: settings.get('ref_instant') + settings.get('ref_active'),
    commission_pct: settings.get('ref_commission_pct'),
    ads_target: settings.get('ref_ads_target'),
    tasks_target: settings.get('ref_tasks_target'),
    counts: { total: refs.length, active: activeCount, pending: refs.length - activeCount },
    earned: {
      instant, active,
      commission: user.commission_earned || 0,
      total: instant + active + (user.commission_earned || 0),
    },
    my_status: dbmod.getReferralForUser(user.id) ? dbmod.getReferralForUser(user.id).status : null,
    referrals: refs.map((r) => ({
      user_id: r.user_id, first_name: r.first_name, username: r.username,
      status: r.status, created_at: r.created_at,
    })),
    user: publicUser(user),
  });
});

// --- Leaderboard ---
// Leaderboard lists are cached for 60s (they're identical for every user;
// only `me` is computed per-request).
let _lbCache = null;
let _lbCacheTs = 0;
const LB_CACHE_MS = 60 * 1000;

app.get('/api/leaderboard', (req, res) => {
  let me = null;
  try {
    const u = authedUser(req);
    me = { id: u.id, points: u.points, referrals: u.referrals, rank: dbmod.getRank(u.id) };
  } catch { /* anonymous */ }

  if (!_lbCache || Date.now() - _lbCacheTs > LB_CACHE_MS) {
    const shape = (row, i) => ({
      rank: i + 1, id: row.id, username: row.username, first_name: row.first_name,
      points: row.points, referrals: row.referrals, photo_url: row.photo_url || '',
    });
    _lbCache = {
      leaderboard: dbmod.getLeaderboard().map(shape),
      top_earners: dbmod.getTopEarners(50).map(shape),
      top_referrers: dbmod.getTopReferrers(50).map(shape),
    };
    _lbCacheTs = Date.now();
  }
  res.json({ ..._lbCache, me });
});

// --- Wallet / Withdraw (USDT BEP-20) ---
function withdrawRequirements(user) {
  const adsReq = settings.get('withdraw_ads_required');
  const tasksReq = settings.get('withdraw_tasks_required');
  const refsReq = settings.get('withdraw_referrals_required');
  const ads = user.ads_watched || 0;
  const tasks = user.tasks_completed || 0;
  const refs = user.referrals || 0;
  return {
    ads: { have: Math.min(ads, adsReq), need: adsReq },
    tasks: { have: Math.min(tasks, tasksReq), need: tasksReq },
    referrals: { have: Math.min(refs, refsReq), need: refsReq },
    met: ads >= adsReq && tasks >= tasksReq && refs >= refsReq,
  };
}

// Withdraw cooldown helper (default 10h, configurable)
function withdrawCooldownInfo(user) {
  const cooldownMs = settings.get('withdraw_cooldown_hours') * 3600000;
  const lastWd = dbmod.getLastWithdrawal(user.id);
  const lastTs = lastWd ? lastWd.created_at : 0;
  const remainingMs = Math.max(0, (lastTs + cooldownMs) - Date.now());
  return {
    cooldown_ms: cooldownMs,
    last_withdraw_ts: lastTs,
    ready: remainingMs <= 0,
    retry_in_ms: remainingMs,
  };
}

app.get('/api/wallet', (req, res) => {
  const user = authedUser(req);
  const cd = withdrawCooldownInfo(user);
  res.json({
    currency: config.WITHDRAW_CURRENCY,
    address_label: config.WITHDRAW_ADDRESS_LABEL,
    mango_to_usdt: settings.get('mango_to_usdt'),
    min_withdraw_usdt: settings.get('min_withdraw_usdt'),
    min_withdraw_coins: usdtToCoins(settings.get('min_withdraw_usdt')),
    fee_pct: settings.get('withdraw_fee_pct'),
    balance: user.points,
    balance_usdt: coinsToUsdt(user.points),
    wallet_address: user.wallet_address || '',
    requirements: withdrawRequirements(user),
    withdrawals: dbmod.listUserWithdrawals(user.id),
    withdraw_cooldown: cd,
  });
});

app.post('/api/wallet/address', (req, res) => {
  const user = authedUser(req);
  const address = String(req.body.address || '').trim();
  if (!address) return res.status(400).json({ error: 'Address required' });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid USDT (BEP-20) address — must start with 0x and be 42 characters' });
  }
  dbmod.updateUserFields(user.id, { wallet_address: address });
  res.json({ ok: true, user: publicUser(dbmod.getUser(user.id)) });
});

app.post('/api/withdraw', async (req, res) => {
  const user = authedUser(req);
  const coins = Math.floor(parseFloat(req.body.coins));
  const address = String(req.body.address || user.wallet_address || '').trim();
  const minCoins = usdtToCoins(settings.get('min_withdraw_usdt'));
  const feePct = settings.get('withdraw_fee_pct');

  if (!coins || isNaN(coins)) return res.status(400).json({ error: 'Enter a valid Mango amount' });
  if (coins < minCoins) {
    return res.status(400).json({ error: `Minimum withdraw is ${minCoins} Mango (${settings.get('min_withdraw_usdt')} ${config.WITHDRAW_CURRENCY})` });
  }
  if (coins > user.points) return res.status(400).json({ error: 'Not enough balance' });
  if (!address) return res.status(400).json({ error: 'Add your wallet address first' });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid USDT (BEP-20) address — must start with 0x and be 42 characters' });
  }

  // withdraw cooldown — must wait before the next request
  const cd = withdrawCooldownInfo(user);
  if (!cd.ready) {
    const waitM = Math.max(1, Math.ceil(cd.retry_in_ms / 60000));
    const waitH = Math.floor(waitM / 60);
    const waitMin = waitM % 60;
    return res.status(400).json({
      error: `Withdraw cooldown — next withdraw in ${waitH}h ${waitMin}m`,
      retry_in_ms: cd.retry_in_ms,
    });
  }

  // withdraw unlock requirements (ads / tasks / referrals)
  const reqs = withdrawRequirements(user);
  if (!reqs.met) {
    return res.status(400).json({
      error: 'Complete the requirements to unlock withdrawals',
      requirements: reqs,
    });
  }

  const usdt = coinsToUsdt(coins);
  const feeUsdt = Math.round(usdt * feePct) / 100;
  const netUsdt = Math.round((usdt - feeUsdt) * 10000) / 10000;

  dbmod.updateUserFields(user.id, { points: user.points - coins, wallet_address: address });
  const wd = dbmod.createWithdrawal({ userId: user.id, amount: coins, amountUsdt: usdt, feeUsdt, netUsdt, address });

  notify(user.id, `💸 Withdraw request received!\n\n💰 Amount: ${usdt} ${config.WITHDRAW_CURRENCY}\n🧾 Fee (${feePct}%): ${feeUsdt} ${config.WITHDRAW_CURRENCY}\n💵 You'll receive: ${netUsdt} ${config.WITHDRAW_CURRENCY}\n📍 Address: ${address}\n⏳ Status: Pending`);

  res.json({ ok: true, withdrawal: wd, user: publicUser(dbmod.getUser(user.id)) });
});

// ============================================================
//  ROUTES — admin panel
// ============================================================

app.post('/api/admin/login', (req, res) => {
  let username = null;

  if (config.BOT_TOKEN) {
    const verified = verifyInitData(req.body.initData, config.BOT_TOKEN);
    if (!verified || !verified.user) {
      return res.status(401).json({ error: 'Open the admin panel from inside Telegram' });
    }
    username = verified.user.username;
  } else {
    username = req.body.username;
  }

  const password = req.body.password || '';
  if (!username || !password) return res.status(401).json({ error: 'Username and password required' });

  if (!dbmod.checkAdmin(username, password)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  const normUser = String(username).trim().replace(/^@/, '').toLowerCase();
  const token = createSession(normUser);
  res.json({ token, username: normUser });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.adminUsername });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const username = req.adminUsername;
  const oldPw = String(req.body.old_password || '');
  const newPw = String(req.body.new_password || '');

  if (!dbmod.checkAdmin(username, oldPw)) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  if (newPw.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (!dbmod.setAdminPassword(username, newPw)) {
    return res.status(404).json({ error: 'Admin not found' });
  }
  res.json({ ok: true });
});

// --- stats ---
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalWd = dbmod.db.prepare('SELECT COALESCE(SUM(amount_usdt),0) AS n FROM withdrawals').get().n;
  const totalPaid = dbmod.db.prepare("SELECT COALESCE(SUM(net_usdt),0) AS n FROM withdrawals WHERE status = 'approved'").get().n;
  res.json({
    users: dbmod.getUserCount(),
    total_points: dbmod.getTotalPoints(),
    pending_withdrawals: dbmod.countPendingWithdrawals(),
    total_withdraw_usdt: totalWd,
    total_paid_usdt: totalPaid,
  });
});

// --- gate diagnostics (admin) ---
app.get('/api/admin/gate-logs', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 300);
  const rows = dbmod.listGateLogs(limit).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    username: r.username,
    passed: !!r.passed,
    detail: r.detail,
    ts: r.ts,
    time: new Date(r.ts).toISOString(),
  }));
  res.json({ logs: rows });
});

// --- users (admin management) ---
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: dbmod.listAllUsersAdmin() });
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const ok = dbmod.setUserBanned(parseInt(req.params.id, 10), !!req.body.banned);
  if (!ok) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = dbmod.deleteUser(id);
  if (!ok) return res.status(404).json({ error: 'User not found' });
  console.log(`[admin] user ${id} deleted by @${req.adminUsername}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/balance', requireAdmin, (req, res) => {
  const delta = parseInt(req.body.delta, 10);
  if (!Number.isFinite(delta)) return res.status(400).json({ error: 'delta required' });
  const user = dbmod.adjustUserPoints(parseInt(req.params.id, 10), delta);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true, points: user.points });
});

app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = dbmod.getUser(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: {
      id: user.id, username: user.username, first_name: user.first_name,
      points: user.points, referrals: user.referrals, ads_watched: user.ads_watched,
      tasks_completed: user.tasks_completed, banned: user.banned,
      wallet_address: user.wallet_address, created_at: user.created_at,
    },
    referrals: dbmod.listReferrals(id),
    withdrawals: dbmod.listUserWithdrawals(id),
  });
});

// --- gate channels ---
app.get('/api/admin/gate', requireAdmin, (req, res) => res.json({ channels: dbmod.listGateChannelsAll() }));

app.post('/api/admin/gate', requireAdmin, (req, res) => {
  const { title, channel, url, image, sort } = req.body;
  if (!title || !channel || !url) return res.status(400).json({ error: 'title, channel and url are required' });
  const id = dbmod.addGateChannel({ title, channel, url, image, sort });
  res.json({ ok: true, id });
});

app.put('/api/admin/gate/:id', requireAdmin, (req, res) => {
  const fields = {};
  for (const k of ['title', 'channel', 'url', 'image', 'sort', 'active']) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  const ok = dbmod.updateGateChannel(parseInt(req.params.id, 10), fields);
  if (!ok) return res.status(404).json({ error: 'Channel not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/gate/:id', requireAdmin, (req, res) => {
  const ok = dbmod.deleteGateChannel(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'Channel not found' });
  res.json({ ok: true });
});

// --- tasks ---
app.get('/api/admin/tasks', requireAdmin, (req, res) => res.json({ tasks: dbmod.listTasksAll() }));

app.post('/api/admin/tasks', requireAdmin, (req, res) => {
  const { category, type, title, desc, reward, url, channel, image, sort } = req.body;
  if (!category || !type || !title) return res.status(400).json({ error: 'category, type and title required' });
  if (!['main', 'partner', 'ads'].includes(category)) return res.status(400).json({ error: 'category must be main/partner/ads' });
  const id = dbmod.addTask({ category, type, title, desc, reward, url, channel, image, sort });
  res.json({ ok: true, id });
});

app.put('/api/admin/tasks/:id', requireAdmin, (req, res) => {
  const fields = {};
  for (const k of ['category', 'type', 'title', 'desc', 'reward', 'url', 'channel', 'image', 'sort', 'active']) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  const ok = dbmod.updateTask(parseInt(req.params.id, 10), fields);
  if (!ok) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/tasks/:id', requireAdmin, (req, res) => {
  const ok = dbmod.deleteTask(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});

// --- reward codes (admin) ---
app.get('/api/admin/reward-codes', requireAdmin, (req, res) => {
  res.json({ codes: dbmod.listRewardCodes() });
});

app.post('/api/admin/reward-codes', requireAdmin, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const reward = parseInt(req.body.reward, 10);
  const maxUses = parseInt(req.body.max_uses, 10) || 0;
  if (!code) return res.status(400).json({ error: 'Code required' });
  if (!reward || reward <= 0) return res.status(400).json({ error: 'Reward must be > 0' });
  if (dbmod.getRewardCode(code)) return res.status(400).json({ error: 'Code already exists' });
  const id = dbmod.createRewardCode(code, reward, maxUses);
  res.json({ ok: true, id });
});

app.delete('/api/admin/reward-codes/:id', requireAdmin, (req, res) => {
  const ok = dbmod.deleteRewardCode(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.put('/api/admin/reward-codes/:id', requireAdmin, (req, res) => {
  const ok = dbmod.toggleRewardCode(parseInt(req.params.id, 10), !!req.body.active);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- ads (watch & earn offers) ---
app.get('/api/admin/ads', requireAdmin, (req, res) => res.json({ ads: dbmod.listAdsAll() }));

app.post('/api/admin/ads', requireAdmin, (req, res) => {
  const { name, image, reward, daily_limit, block_id, sort } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = dbmod.addAd({ name, image, reward, daily_limit, block_id, sort });
  res.json({ ok: true, id });
});

app.put('/api/admin/ads/:id', requireAdmin, (req, res) => {
  const fields = {};
  for (const k of ['name', 'image', 'reward', 'daily_limit', 'block_id', 'active', 'sort']) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  const ok = dbmod.updateAd(parseInt(req.params.id, 10), fields);
  if (!ok) return res.status(404).json({ error: 'Ad not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/ads/:id', requireAdmin, (req, res) => {
  const ok = dbmod.deleteAd(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'Ad not found' });
  res.json({ ok: true });
});

// --- settings (runtime-configurable rewards/economy) ---
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: settings.all(), defaults: settings.defaults() });
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const updated = settings.update(req.body || {});
  res.json({ ok: true, settings: updated });
});

// --- withdrawals (with tax) ---
app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
  const status = req.query.status || null;
  const list = dbmod.listWithdrawals(status).map((w) => {
    const u = dbmod.getUser(w.user_id);
    return {
      id: w.id, user_id: w.user_id, amount: w.amount, amount_usdt: w.amount_usdt,
      address: w.address, status: w.status, fee_usdt: w.fee_usdt, tax_usdt: w.tax_usdt,
      net_usdt: w.net_usdt, tx: w.tx, note: w.note, created_at: w.created_at, reviewed_at: w.reviewed_at,
      user_first_name: u ? u.first_name : null, user_username: u ? u.username : null,
    };
  });
  res.json({ withdrawals: list });
});

app.post('/api/admin/withdrawals/:id/approve', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const wd = dbmod.getWithdrawal(id);
  if (!wd) return res.status(404).json({ error: 'Not found' });
  if (wd.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

  const tx = String(req.body.tx || '').trim();
  if (!tx) return res.status(400).json({ error: 'Tx hash required' });

  // Fee is auto-calculated at request time (wd.fee_usdt / wd.net_usdt)
  const taxUsdt = wd.fee_usdt || 0;
  const netUsdt = wd.net_usdt || Math.round((wd.amount_usdt - taxUsdt) * 10000) / 10000;

  dbmod.setWithdrawalApproved(id, { taxUsdt, netUsdt, tx, note: req.body.note || null });

  const user = dbmod.getUser(wd.user_id);
  const uname = user && user.username
    ? '@' + user.username
    : ((user && user.first_name) || ('ID ' + wd.user_id));

  const payMsg =
    `✅ Withdraw approved \n\n` +
    `👤 User - ${uname}\n` +
    `💰 Amount: ${wd.amount_usdt} USDT\n` +
    `🧾 Fee (${settings.get('withdraw_fee_pct')}%): ${wd.fee_usdt} USDT\n` +
    `💵 You'll receive: ${wd.net_usdt} USDT\n` +
    `🌐 Network - USDT ( BEP 20 )\n` +
    `📥 Wallet - ${wd.address}\n\n` +
    `🔗 Tax - ${tx}`;

  // "BscScan Transaction" button (only when tx looks like a real tx hash)
  const txUrl = /^0x[0-9a-fA-F]{64}$/.test(tx) ? `https://bscscan.com/tx/${tx}` : null;
  const payMarkup = txUrl
    ? { inline_keyboard: [[{ text: '🔎 BscScan Transaction', url: txUrl }]] }
    : undefined;

  // post to payment channel (withdraw_channel)
  const withdrawChannel = settings.get('withdraw_channel');
  if (withdrawChannel) {
    sendMessage(withdrawChannel, payMsg, payMarkup).catch(() => {});
  }

  // notify user
  await sendMessage(wd.user_id,
    `${payMsg}\n\n${req.body.note ? '📝 ' + req.body.note : 'Thanks for using ' + config.APP_NAME + ' 🥭'}`,
    payMarkup);

  res.json({ ok: true, net_usdt: netUsdt, tax_usdt: taxUsdt });
});

app.post('/api/admin/withdrawals/:id/reject', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const wd = dbmod.getWithdrawal(id);
  if (!wd) return res.status(404).json({ error: 'Not found' });
  if (wd.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

  dbmod.setWithdrawalRejected(id, req.body.note || null);
  dbmod.addPoints(wd.user_id, wd.amount);

  await sendMessage(wd.user_id,
    `❌ Withdraw rejected.\n\n💰 Amount: ${wd.amount_usdt} ${config.WITHDRAW_CURRENCY} (refunded to balance)\n${req.body.note ? '📝 ' + req.body.note : ''}`);
  res.json({ ok: true });
});

// --- broadcast ---
app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
  const text = String(req.body.text || '').trim();
  const image = req.body.image || null;
  if (!text && !image) return res.status(400).json({ error: 'Message required' });
  if (!config.BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN not set — broadcasting disabled' });

  const users = dbmod.getAllUsers();
  const broadcastId = dbmod.createBroadcast(text, image, users.length);

  (async () => {
    let sent = 0;
    for (const u of users) {
      let ok;
      if (image) ok = await sendPhoto(u.id, image, text || '');
      else ok = await sendMessage(u.id, text);
      if (ok) sent++;
      dbmod.updateBroadcastCount(broadcastId, sent);
      await new Promise((r) => setTimeout(r, 40));
    }
    console.log(`📣 Broadcast #${broadcastId} done: ${sent}/${users.length}`);
  })();

  res.json({ ok: true, queued: users.length, broadcast_id: broadcastId });
});

app.get('/api/admin/broadcasts', requireAdmin, (req, res) => {
  res.json({ broadcasts: dbmod.listBroadcasts() });
});

// ============================================================
//  ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

// ============================================================
//  BOT long-polling
// ============================================================

let botOffset = 0;
let botPolling = false;

async function pollBot() {
  try {
    const url =
      `https://api.telegram.org/bot${config.BOT_TOKEN}/getUpdates` +
      `?timeout=25&offset=${botOffset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.ok && data.result.length) {
      for (const upd of data.result) {
        botOffset = upd.update_id + 1;
        const msg = upd.message;
        if (msg && msg.text) await handleBotMessage(msg);
      }
    }
  } catch (e) {
    console.error('[bot] poll error:', e.message);
  }
  if (botPolling) setTimeout(pollBot, 300);
}

function isAdminSender(from) {
  return !!(from && from.username && dbmod.isAdminUsername(from.username));
}

async function handleBotMessage(msg) {
  const from = msg.from;
  if (!from) return;
  const text = msg.text;

  if (text.startsWith('/start')) {
    const payload = (text.split(' ')[1] || '').trim();
    console.log(`[bot] /start from ${from.id} (@${from.username || '-'}) payload='${payload || '(none)'}'`);
    const u = dbmod.upsertFromStart({ id: from.id, username: from.username, first_name: from.first_name, last_name: from.last_name });

    // Grant the referral right here — the most reliable point, since the
    // web_app button does NOT forward startapp as initData start_param.
    if (payload.startsWith('ref_')) {
      const refId = parseInt(payload.slice(4), 10);
      if (Number.isFinite(refId) && refId > 0) {
        try { grantReferral(u || dbmod.getUser(from.id), refId); }
        catch (e) { console.log('[ref] /start grant error:', e.message); }
      }
    }

    const appUrl = payload.startsWith('ref_')
      ? `${config.APP_URL}?startapp=${encodeURIComponent(payload)}`
      : config.APP_URL;

    await sendMessage(msg.chat.id,
      `👋 Welcome to ${config.APP_NAME}! 🥭\n\nEarn Mango coins with Mining Machines, Watch & Earn ads and Tasks. Complete the gate pass, invite friends and withdraw USDT! 🚀`,
      { inline_keyboard: [[{ text: `▶️ Open ${config.APP_NAME}`, web_app: { url: appUrl } }]] });
  } else if (text === '/admin') {
    if (isAdminSender(from)) {
      await sendMessage(msg.chat.id, '🛡️ Admin panel', {
        inline_keyboard: [[{ text: '🛡️ Open Admin Panel', web_app: { url: config.APP_URL + '/admin' } }]],
      });
    } else {
      await sendMessage(msg.chat.id, '⛔ You are not an admin.');
    }
  } else if (isAdminSender(from)) {
    // admin DM = broadcast
    const users = dbmod.getAllUsers();
    const bId = dbmod.createBroadcast(text, users.length);
    let sent = 0;
    for (const u of users) {
      const ok = await sendMessage(u.id, text);
      if (ok) sent++;
      dbmod.updateBroadcastCount(bId, sent);
      await new Promise((r) => setTimeout(r, 40));
    }
    await sendMessage(msg.chat.id, `📣 Broadcast sent to ${sent}/${users.length} users.`);
  }
}

function startBot() {
  if (!config.BOT_TOKEN) return;
  botPolling = true;
  pollBot();
  console.log(`🤖 Bot long-polling started for @${config.BOT_USERNAME}`);
}

// ============================================================
//  START
// ============================================================

seed();

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`✅ ${config.APP_NAME} running on http://0.0.0.0:${config.PORT}`);
  console.log(`   Mode: ${config.BOT_TOKEN ? 'PRODUCTION (Telegram initData verified)' : 'DEMO (no BOT_TOKEN set)'}`);
  console.log('');
  startBot();
});

// Flush pending writes to the remote DB (embedded replica) before shutting down.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`\n🛑 ${sig} received — flushing DB…`);
    try { dbmod.syncAndClose(); } catch { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
