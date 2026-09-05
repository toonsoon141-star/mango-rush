// ============================================================
//  DATABASE LAYER  —  SQLite (libsql, better-sqlite3-compatible)
//
//  Local file by default. Set LIBSQL_URL + LIBSQL_AUTH_TOKEN to
//  keep the DB on Turso (free tier) — the local file becomes an
//  embedded replica that auto-syncs with the remote, so data
//  survives redeploys without needing a persistent disk.
// ============================================================

const path = require('path');
const crypto = require('crypto');
const Database = require('libsql');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const syncUrl = process.env.LIBSQL_URL || '';
const authToken = process.env.LIBSQL_AUTH_TOKEN || '';
let tursoActive = false;

const dbOpts = {};
if (syncUrl) {
  dbOpts.syncUrl = syncUrl;
  dbOpts.authToken = authToken;
  // background sync interval (seconds) — keep it short so writes reach
  // the remote quickly (Turso free tier includes plenty of sync volume)
  dbOpts.syncPeriod = Number(process.env.LIBSQL_SYNC_PERIOD || 1);
  dbOpts.readYourWrites = true;
}

// Open the DB. If a Turso URL is configured but unreachable (bad URL / network),
// fall back to a plain local file so the app keeps running instead of crash-looping.
let db;
if (syncUrl) {
  try {
    db = new Database(dbPath, dbOpts);
    tursoActive = true;
    console.log('🛰️  Turso replica active:', syncUrl);
  } catch (e) {
    console.error('[db] Could not reach Turso — running local-only (no cloud sync):', e.message);
    db = new Database(dbPath, {});
  }
} else {
  db = new Database(dbPath, {});
}

// libsql adds a `_metadata` field to every result row; strip it so the
// API responses stay identical to better-sqlite3's.
(function stripMetadata() {
  const _prepare = db.prepare.bind(db);
  const dropMeta = (r) => {
    if (r && typeof r === 'object' && '_metadata' in r) {
      const { _metadata, ...rest } = r;
      return rest;
    }
    return r;
  };
  db.prepare = (sql) => {
    const stmt = _prepare(sql);
    const _get = stmt.get.bind(stmt);
    const _all = stmt.all.bind(stmt);
    stmt.get = (...a) => dropMeta(_get(...a));
    stmt.all = (...a) => _all(...a).map(dropMeta);
    return stmt;
  };
})();

db.pragma('journal_mode = WAL');

// Best-effort flush of pending writes to the remote (embedded-replica mode).
function syncAndClose() {
  try {
    if (tursoActive) db.sync();
  } catch { /* ignore */ }
  try {
    db.close();
  } catch { /* ignore */ }
}

// ---------------- password hashing (scrypt) ----------------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
}

// ============================================================
//  SCHEMA
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT,
    first_name    TEXT,
    last_name     TEXT,
    points        INTEGER NOT NULL DEFAULT 0,
    energy        INTEGER NOT NULL DEFAULT 1000,
    last_tap_ts   INTEGER NOT NULL DEFAULT 0,
    last_daily_ts INTEGER NOT NULL DEFAULT 0,
    last_spin_ts  INTEGER NOT NULL DEFAULT 0,
    referred_by   INTEGER,
    referrals     INTEGER NOT NULL DEFAULT 0,
    tap_power     INTEGER NOT NULL DEFAULT 1,
    energy_cap    INTEGER NOT NULL DEFAULT 1000,
    wallet_address TEXT NOT NULL DEFAULT '',
    ads_watched   INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    commission_earned INTEGER NOT NULL DEFAULT 0,
    streak_count    INTEGER NOT NULL DEFAULT 0,
    streak_date     TEXT NOT NULL DEFAULT '',
    today_earned    INTEGER NOT NULL DEFAULT 0,
    today_date      TEXT NOT NULL DEFAULT '',
    photo_url       TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_claims (
    user_id    INTEGER NOT NULL,
    task_id    TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, task_id)
  );

  CREATE TABLE IF NOT EXISTS gate_channels (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT NOT NULL,
    channel TEXT NOT NULL,
    url     TEXT NOT NULL,
    image   TEXT,
    sort    INTEGER NOT NULL DEFAULT 0,
    active  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'main',
    type     TEXT NOT NULL DEFAULT 'link',
    title    TEXT NOT NULL,
    desc     TEXT NOT NULL DEFAULT '',
    reward   INTEGER NOT NULL DEFAULT 0,
    url      TEXT,
    channel  TEXT,
    sort     INTEGER NOT NULL DEFAULT 0,
    active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS referrals (
    user_id        INTEGER PRIMARY KEY,
    referrer_id    INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    instant_reward INTEGER NOT NULL DEFAULT 0,
    active_reward  INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    activated_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    amount      INTEGER NOT NULL,       -- coins deducted
    amount_usdt REAL NOT NULL,          -- requested USDT
    address     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    fee_usdt    REAL NOT NULL DEFAULT 0,  -- expected fee (estimate)
    tax_usdt    REAL NOT NULL DEFAULT 0,  -- actual tax (set on approve)
    net_usdt    REAL NOT NULL DEFAULT 0,  -- amount - tax (paid)
    tx          TEXT,                     -- transaction hash (set on approve)
    note        TEXT,
    created_at  INTEGER NOT NULL,
    reviewed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS broadcasts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    sent_count  INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reward_codes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    code      TEXT NOT NULL UNIQUE,
    reward    INTEGER NOT NULL DEFAULT 0,
    max_uses  INTEGER NOT NULL DEFAULT 0,
    used      INTEGER NOT NULL DEFAULT 0,
    active    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reward_code_claims (
    user_id    INTEGER NOT NULL,
    code_id    INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, code_id)
  );

  CREATE TABLE IF NOT EXISTS machine_claims (
    user_id      INTEGER NOT NULL,
    machine_id   TEXT NOT NULL,
    claim_date   TEXT NOT NULL,
    claims_today INTEGER NOT NULL DEFAULT 0,
    last_claim_ts INTEGER NOT NULL DEFAULT 0,
    ads_progress INTEGER NOT NULL DEFAULT 0,
    last_ad_ts   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, machine_id)
  );

  CREATE TABLE IF NOT EXISTS ads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    image       TEXT,
    reward      INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER NOT NULL DEFAULT 5,
    block_id    TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ad_claims (
    user_id      INTEGER NOT NULL,
    ad_id        INTEGER NOT NULL,
    claim_date   TEXT NOT NULL,
    claims_today INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, ad_id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    username      TEXT PRIMARY KEY,          -- lowercase telegram username
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gate_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    username    TEXT,
    passed      INTEGER NOT NULL DEFAULT 0,
    detail      TEXT,
    ts          INTEGER NOT NULL
  );
`);

// ---- migrations for older DBs ----
const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!cols.includes('last_spin_ts')) db.exec('ALTER TABLE users ADD COLUMN last_spin_ts INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('tap_power')) db.exec('ALTER TABLE users ADD COLUMN tap_power INTEGER NOT NULL DEFAULT 1');
if (!cols.includes('energy_cap')) db.exec('ALTER TABLE users ADD COLUMN energy_cap INTEGER NOT NULL DEFAULT 1000');
if (!cols.includes('wallet_address')) db.exec("ALTER TABLE users ADD COLUMN wallet_address TEXT NOT NULL DEFAULT ''");
if (!cols.includes('ads_watched')) db.exec('ALTER TABLE users ADD COLUMN ads_watched INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('tasks_completed')) db.exec('ALTER TABLE users ADD COLUMN tasks_completed INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('commission_earned')) db.exec('ALTER TABLE users ADD COLUMN commission_earned INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('streak_count')) db.exec('ALTER TABLE users ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('streak_date')) db.exec("ALTER TABLE users ADD COLUMN streak_date TEXT NOT NULL DEFAULT ''");
if (!cols.includes('photo_url')) db.exec("ALTER TABLE users ADD COLUMN photo_url TEXT NOT NULL DEFAULT ''");
if (!cols.includes('ads_today')) db.exec('ALTER TABLE users ADD COLUMN ads_today INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('ads_today_date')) db.exec("ALTER TABLE users ADD COLUMN ads_today_date TEXT NOT NULL DEFAULT ''");

const mcCols = db.prepare('PRAGMA table_info(machine_claims)').all().map((c) => c.name);
if (!mcCols.includes('ads_progress')) db.exec('ALTER TABLE machine_claims ADD COLUMN ads_progress INTEGER NOT NULL DEFAULT 0');
if (!mcCols.includes('last_ad_ts')) db.exec('ALTER TABLE machine_claims ADD COLUMN last_ad_ts INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('today_earned')) db.exec('ALTER TABLE users ADD COLUMN today_earned INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('today_date')) db.exec("ALTER TABLE users ADD COLUMN today_date TEXT NOT NULL DEFAULT ''");

// withdrawals: add tax_usdt / tx for older DBs
const wCols = db.prepare('PRAGMA table_info(withdrawals)').all().map((c) => c.name);
if (!wCols.includes('fee_usdt')) db.exec('ALTER TABLE withdrawals ADD COLUMN fee_usdt REAL NOT NULL DEFAULT 0');
if (!wCols.includes('net_usdt')) db.exec('ALTER TABLE withdrawals ADD COLUMN net_usdt REAL NOT NULL DEFAULT 0');
if (!wCols.includes('tax_usdt')) db.exec('ALTER TABLE withdrawals ADD COLUMN tax_usdt REAL NOT NULL DEFAULT 0');
if (!wCols.includes('tx')) db.exec('ALTER TABLE withdrawals ADD COLUMN tx TEXT');

// tasks / broadcasts image support + user ban flag
const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
if (!taskCols.includes('image')) db.exec('ALTER TABLE tasks ADD COLUMN image TEXT');
const bcCols = db.prepare('PRAGMA table_info(broadcasts)').all().map((c) => c.name);
if (!bcCols.includes('image')) db.exec('ALTER TABLE broadcasts ADD COLUMN image TEXT');
const uCols2 = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!uCols2.includes('banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');

// ============================================================
//  ADMINS
// ============================================================

function normUsername(u) { return String(u || '').trim().toLowerCase(); }

function isAdminUsername(username) {
  return !!db.prepare('SELECT 1 FROM admins WHERE username = ?').get(normUsername(username));
}

function checkAdmin(username, password) {
  const row = db.prepare('SELECT password_hash FROM admins WHERE username = ?').get(normUsername(username));
  if (!row) return false;
  return verifyPassword(password, row.password_hash);
}

function seedAdmin(username, displayName, password) {
  const u = normUsername(username);
  if (!u) return;
  const exists = db.prepare('SELECT 1 FROM admins WHERE username = ?').get(u);
  if (exists) return;
  db.prepare('INSERT INTO admins (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(u, displayName || ('@' + u), hashPassword(password), Date.now());
}

function setAdminPassword(username, password) {
  return db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
    .run(hashPassword(password), normUsername(username)).changes > 0;
}

function listAdmins() {
  return db.prepare('SELECT username, display_name, created_at FROM admins ORDER BY created_at').all();
}

// ============================================================
//  SETTINGS (raw key/value)
// ============================================================

function getSettingsRaw() {
  return db.prepare('SELECT key, value FROM settings').all();
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// ============================================================
//  USERS
// ============================================================

const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, first_name, last_name, points, energy, referred_by, photo_url, created_at)
  VALUES (@id, @username, @first_name, @last_name, 0, 1000, @referred_by, @photo_url, @created_at)
`);

function getUser(id) { return getUserStmt.get(id) || null; }

function createUser({ id, username, first_name, last_name, referred_by, photo_url }) {
  insertUserStmt.run({
    id, username: username || '', first_name: first_name || '', last_name: last_name || '',
    referred_by: referred_by || null, photo_url: photo_url || '', created_at: Date.now(),
  });
  return getUser(id);
}

// Keep the profile fresh: when Telegram sends a photo_url, store it if changed.
function syncUserProfile(id, telegramUser) {
  const u = getUser(id);
  if (!u) return null;
  const photo = telegramUser && telegramUser.photo_url ? telegramUser.photo_url : '';
  const changes = {};
  if (photo && photo !== (u.photo_url || '')) changes.photo_url = photo;
  if (Object.keys(changes).length) updateUserFields(id, changes);
  return getUser(id);
}

function getUserOrCreate(telegramUser, referredBy) {
  let u = getUser(telegramUser.id);
  if (u) return syncUserProfile(telegramUser.id, telegramUser) || u;
  return createUser({
    id: telegramUser.id, username: telegramUser.username,
    first_name: telegramUser.first_name, last_name: telegramUser.last_name,
    referred_by: referredBy, photo_url: telegramUser.photo_url,
  });
}

function upsertFromStart(telegramUser) {
  let u = getUser(telegramUser.id);
  if (u) return syncUserProfile(telegramUser.id, telegramUser) || u;
  return createUser({
    id: telegramUser.id, username: telegramUser.username,
    first_name: telegramUser.first_name, last_name: telegramUser.last_name,
    referred_by: null, photo_url: telegramUser.photo_url,
  });
}

function updateUserFields(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ id, ...fields });
}

function addPoints(id, amount) {
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(amount, id);
}

function incCounter(id, field, by) {
  db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`).run(by || 1, id);
}

// ---- daily ads counter (resets each day, used for withdraw requirements) ----
function incAdsToday(id) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    UPDATE users SET
      ads_today = CASE WHEN ads_today_date = ? THEN ads_today + 1 ELSE 1 END,
      ads_today_date = ?
    WHERE id = ?
  `).run(today, today, id);
}

function getAdsToday(user) {
  const today = new Date().toISOString().slice(0, 10);
  return (user && user.ads_today_date === today) ? (user.ads_today || 0) : 0;
}

const topUsersStmt = db.prepare('SELECT id, username, first_name, points, referrals FROM users ORDER BY points DESC LIMIT 100');
function getLeaderboard() { return topUsersStmt.all(); }
function getTopEarners(limit) {
  return db.prepare('SELECT id, username, first_name, points, referrals, photo_url FROM users WHERE points > 0 ORDER BY points DESC LIMIT ?').all(limit || 50);
}
function getTopReferrers(limit) {
  return db.prepare('SELECT id, username, first_name, points, referrals, photo_url FROM users WHERE referrals > 0 ORDER BY referrals DESC, points DESC LIMIT ?').all(limit || 50);
}

function getRank(id) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users WHERE points > (SELECT points FROM users WHERE id = ?)').get(id);
  return row ? row.n + 1 : null;
}

function getUserCount() { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; }
function getTotalPoints() { return db.prepare('SELECT COALESCE(SUM(points),0) AS n FROM users').get().n; }
function getAllUsers() { return db.prepare('SELECT id, username, first_name FROM users ORDER BY id').all(); }

// ============================================================
//  REFERRALS
// ============================================================

function createReferral(referrerId, userId) {
  db.prepare(
    'INSERT OR IGNORE INTO referrals (user_id, referrer_id, status, instant_reward, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, referrerId, 'pending', 0, Date.now());
}

function getReferralForUser(userId) {
  return db.prepare('SELECT * FROM referrals WHERE user_id = ?').get(userId) || null;
}

function setReferralActive(userId, activeReward) {
  db.prepare("UPDATE referrals SET status = 'active', active_reward = ?, activated_at = ? WHERE user_id = ?")
    .run(activeReward || 0, Date.now(), userId);
}

function setReferralInstant(userId, reward) {
  db.prepare('UPDATE referrals SET instant_reward = ? WHERE user_id = ?').run(reward, userId);
}

function countReferrals(referrerId, status) {
  if (status) return db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND status = ?').get(referrerId, status).n;
  return db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(referrerId).n;
}

function listReferrals(referrerId) {
  return db.prepare(`
    SELECT r.user_id, r.status, r.instant_reward, r.active_reward, r.created_at,
           u.first_name, u.username, u.points
    FROM referrals r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.referrer_id = ?
    ORDER BY r.created_at DESC
  `).all(referrerId);
}

// ============================================================
//  TASK CLAIMS
// ============================================================

const claimStmt = db.prepare('INSERT OR IGNORE INTO task_claims (user_id, task_id, claimed_at) VALUES (?, ?, ?)');
const hasClaimStmt = db.prepare('SELECT 1 FROM task_claims WHERE user_id = ? AND task_id = ?');
function hasClaimed(userId, taskId) { return !!hasClaimStmt.get(userId, taskId); }
function claimTask(userId, taskId) {
  const res = claimStmt.run(userId, taskId, Date.now());
  return res.changes > 0;
}

// ============================================================
//  TASKS
// ============================================================

const listTasksActiveStmt = db.prepare('SELECT * FROM tasks WHERE active = 1 ORDER BY sort ASC, id ASC');
const listTasksAllStmt = db.prepare('SELECT * FROM tasks ORDER BY sort ASC, id ASC');
const getTaskStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');

function listTasks() { return listTasksActiveStmt.all(); }
function listTasksAll() { return listTasksAllStmt.all(); }
function getTask(id) { return getTaskStmt.get(id); }

function addTask({ category, type, title, desc, reward, url, channel, image, sort }) {
  const info = db.prepare(
    'INSERT INTO tasks (category, type, title, desc, reward, url, channel, image, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
  ).run(category, type, title, desc || '', reward || 0, url || null, channel || null, image || null, sort || 0);
  return info.lastInsertRowid;
}

function updateTask(id, fields) {
  const allowed = ['category', 'type', 'title', 'desc', 'reward', 'url', 'channel', 'image', 'sort', 'active'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return false;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  return db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({ id, ...fields }).changes > 0;
}

function deleteTask(id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

function countTasksInDB() {
  return db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
}

// ============================================================
//  GATE CHANNELS
// ============================================================

const listGateStmt = db.prepare('SELECT * FROM gate_channels WHERE active = 1 ORDER BY sort ASC, id ASC');
const listGateAllStmt = db.prepare('SELECT * FROM gate_channels ORDER BY sort ASC, id ASC');
function listGateChannels() { return listGateStmt.all(); }
function listGateChannelsAll() { return listGateAllStmt.all(); }
function countGateChannels() { return db.prepare('SELECT COUNT(*) AS n FROM gate_channels').get().n; }

function addGateChannel({ title, channel, url, image, sort }) {
  const info = db.prepare(
    'INSERT INTO gate_channels (title, channel, url, image, sort, active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(title, channel, url, image || null, sort || 0);
  return info.lastInsertRowid;
}

function updateGateChannel(id, fields) {
  const allowed = ['title', 'channel', 'url', 'image', 'sort', 'active'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return false;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  return db.prepare(`UPDATE gate_channels SET ${setClause} WHERE id = @id`).run({ id, ...fields }).changes > 0;
}

function deleteGateChannel(id) {
  return db.prepare('DELETE FROM gate_channels WHERE id = ?').run(id).changes > 0;
}

function deleteAllGateChannels() {
  return db.prepare('DELETE FROM gate_channels').run().changes;
}

// Migration helper: repoint any task that references a legacy channel.
function repointTaskChannel(legacyChannel, newChannel, newUrl) {
  db.prepare('UPDATE tasks SET channel = ? WHERE channel = ?').run(newChannel, legacyChannel);
  db.prepare('UPDATE tasks SET url = ? WHERE url = ?').run(newUrl, 'https://t.me/' + legacyChannel.replace(/^@/, ''));
  db.prepare('UPDATE tasks SET url = ? WHERE url LIKE ?').run(newUrl, '%' + legacyChannel.replace(/^@/, '') + '%');
}

// ---- gate diagnostics ----
function logGateAttempt(userId, username, passed, detail) {
  try {
    db.prepare('INSERT INTO gate_logs (user_id, username, passed, detail, ts) VALUES (?, ?, ?, ?, ?)')
      .run(userId, username || null, passed ? 1 : 0, detail || null, Date.now());
    // keep only the last 300 rows
    db.prepare('DELETE FROM gate_logs WHERE id NOT IN (SELECT id FROM gate_logs ORDER BY id DESC LIMIT 300)').run();
  } catch (e) { /* never break the request */ }
}

function listGateLogs(limit = 50) {
  try {
    return db.prepare('SELECT * FROM gate_logs ORDER BY id DESC LIMIT ?').all(limit);
  } catch (e) { return []; }
}

// ============================================================
//  WITHDRAWALS
// ============================================================

function createWithdrawal({ userId, amount, amountUsdt, feeUsdt, netUsdt, address }) {
  const info = db.prepare(
    'INSERT INTO withdrawals (user_id, amount, amount_usdt, address, status, fee_usdt, net_usdt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, amount, amountUsdt, address, 'pending', feeUsdt || 0, netUsdt || 0, Date.now());
  return getWithdrawal(info.lastInsertRowid);
}

function getWithdrawal(id) { return db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id); }

function listWithdrawals(status) {
  if (status) return db.prepare('SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at DESC').all(status);
  return db.prepare('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 500').all();
}

function listUserWithdrawals(userId) {
  return db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(userId);
}

function getLastWithdrawal(userId) {
  return db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) || null;
}

function countPendingWithdrawals() {
  return db.prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE status = 'pending'").get().n;
}

function setWithdrawalApproved(id, { taxUsdt, netUsdt, tx, note }) {
  return db.prepare(
    "UPDATE withdrawals SET status = 'approved', tax_usdt = ?, net_usdt = ?, tx = ?, note = ?, reviewed_at = ? WHERE id = ?"
  ).run(taxUsdt || 0, netUsdt || 0, tx || null, note || null, Date.now(), id).changes > 0;
}

function setWithdrawalRejected(id, note) {
  return db.prepare(
    "UPDATE withdrawals SET status = 'rejected', note = ?, reviewed_at = ? WHERE id = ?"
  ).run(note || null, Date.now(), id).changes > 0;
}

// ============================================================
//  BROADCASTS
// ============================================================

function createBroadcast(text, image, total) {
  const info = db.prepare('INSERT INTO broadcasts (text, image, total, created_at) VALUES (?, ?, ?, ?)')
    .run(text, image || null, total || 0, Date.now());
  return info.lastInsertRowid;
}
function updateBroadcastCount(id, sent) { db.prepare('UPDATE broadcasts SET sent_count = ? WHERE id = ?').run(sent, id); }
function listBroadcasts() { return db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50').all(); }

// ============================================================
//  ADS (watch & earn offers)
// ============================================================

const listAdsActiveStmt = db.prepare('SELECT * FROM ads WHERE active = 1 ORDER BY sort ASC, id ASC');
const listAdsAllStmt = db.prepare('SELECT * FROM ads ORDER BY sort ASC, id ASC');
const getAdStmt = db.prepare('SELECT * FROM ads WHERE id = ?');
const getAdClaimStmt = db.prepare('SELECT * FROM ad_claims WHERE user_id = ? AND ad_id = ?');

function listAds() { return listAdsActiveStmt.all(); }
function listAdsAll() { return listAdsAllStmt.all(); }
function getAd(id) { return getAdStmt.get(id); }
function countAds() { return db.prepare('SELECT COUNT(*) AS n FROM ads').get().n; }

function addAd({ name, image, reward, daily_limit, block_id, sort }) {
  const info = db.prepare(
    'INSERT INTO ads (name, image, reward, daily_limit, block_id, active, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(name, image || null, reward || 0, daily_limit || 5, block_id || null, sort || 0, Date.now());
  return info.lastInsertRowid;
}

function updateAd(id, fields) {
  const allowed = ['name', 'image', 'reward', 'daily_limit', 'block_id', 'active', 'sort'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return false;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  return db.prepare(`UPDATE ads SET ${setClause} WHERE id = @id`).run({ id, ...fields }).changes > 0;
}

function deleteAd(id) {
  return db.prepare('DELETE FROM ads WHERE id = ?').run(id).changes > 0;
}

function getAdClaim(userId, adId) { return getAdClaimStmt.get(userId, adId) || null; }

function updateAdClaim(userId, adId, date, claimsToday) {
  db.prepare(
    'INSERT INTO ad_claims (user_id, ad_id, claim_date, claims_today) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(user_id, ad_id) DO UPDATE SET claim_date = excluded.claim_date, claims_today = excluded.claims_today'
  ).run(userId, adId, date, claimsToday);
}

// ============================================================
//  USERS (admin management)
// ============================================================

function listAllUsersAdmin() {
  return db.prepare(
    'SELECT id, username, first_name, points, referrals, ads_watched, tasks_completed, banned, created_at FROM users ORDER BY created_at DESC'
  ).all();
}

function setUserBanned(id, banned) {
  return db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id).changes > 0;
}

function adjustUserPoints(id, delta) {
  db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(delta || 0, id);
  return getUser(id);
}

function isUserBanned(id) {
  const row = db.prepare('SELECT banned FROM users WHERE id = ?').get(id);
  return !!(row && row.banned);
}

function deleteUser(id) {
  // if this user was someone's referral, roll back the referrer's counters
  const ref = db.prepare('SELECT * FROM referrals WHERE user_id = ?').get(id);
  if (ref) {
    const paid = (ref.instant_reward || 0) + (ref.active_reward || 0);
    db.prepare('UPDATE users SET referrals = MAX(0, referrals - 1), points = MAX(0, points - ?) WHERE id = ?')
      .run(paid, ref.referrer_id);
  }
  // wipe every trace of the user
  db.prepare('DELETE FROM referrals WHERE user_id = ? OR referrer_id = ?').run(id, id);
  db.prepare('DELETE FROM task_claims WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM machine_claims WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM ad_claims WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM reward_code_claims WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM withdrawals WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM gate_logs WHERE user_id = ?').run(id);
  // clear referred_by pointers from users this user referred
  db.prepare('UPDATE users SET referred_by = NULL WHERE referred_by = ?').run(id);
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

// ============================================================
//  REWARD CODES
// ============================================================

function getRewardCode(code) {
  return db.prepare('SELECT * FROM reward_codes WHERE code = ?').get(String(code).trim().toUpperCase()) || null;
}

function listRewardCodes() {
  return db.prepare('SELECT * FROM reward_codes ORDER BY created_at DESC').all();
}

function createRewardCode(code, reward, maxUses) {
  const info = db.prepare(
    'INSERT INTO reward_codes (code, reward, max_uses, used, active, created_at) VALUES (?, ?, ?, 0, 1, ?)'
  ).run(String(code).trim().toUpperCase(), reward || 0, maxUses || 0, Date.now());
  return info.lastInsertRowid;
}

function deleteRewardCode(id) {
  return db.prepare('DELETE FROM reward_codes WHERE id = ?').run(id).changes > 0;
}

function toggleRewardCode(id, active) {
  return db.prepare('UPDATE reward_codes SET active = ? WHERE id = ?').run(active ? 1 : 0, id).changes > 0;
}

function hasRewardCodeClaimed(userId, codeId) {
  return !!db.prepare('SELECT 1 FROM reward_code_claims WHERE user_id = ? AND code_id = ?').get(userId, codeId);
}

function claimRewardCode(userId, codeId) {
  const res = db.prepare('INSERT OR IGNORE INTO reward_code_claims (user_id, code_id, claimed_at) VALUES (?, ?, ?)').run(userId, codeId, Date.now());
  if (res.changes > 0) {
    db.prepare('UPDATE reward_codes SET used = used + 1 WHERE id = ?').run(codeId);
  }
  return res.changes > 0;
}

// ============================================================
//  MACHINE CLAIMS
// ============================================================

function getMachineClaim(userId, machineId) {
  return db.prepare('SELECT * FROM machine_claims WHERE user_id = ? AND machine_id = ?').get(userId, machineId) || null;
}

function updateMachineClaim(userId, machineId, dateStr, claimsToday, lastClaimTs) {
  db.prepare(`
    INSERT INTO machine_claims (user_id, machine_id, claim_date, claims_today, last_claim_ts, ads_progress, last_ad_ts)
    VALUES (?, ?, ?, ?, ?, 0, 0)
    ON CONFLICT(user_id, machine_id) DO UPDATE SET
      claim_date = excluded.claim_date,
      claims_today = excluded.claims_today,
      last_claim_ts = excluded.last_claim_ts,
      ads_progress = 0,
      last_ad_ts = 0
  `).run(userId, machineId, dateStr, claimsToday, lastClaimTs);
}

// Records one watched ad within a machine's current cycle (progress toward the claim).
function updateMachineWatch(userId, machineId, adsProgress, lastAdTs) {
  db.prepare(`
    INSERT INTO machine_claims (user_id, machine_id, claim_date, claims_today, last_claim_ts, ads_progress, last_ad_ts)
    VALUES (?, ?, '', 0, 0, ?, ?)
    ON CONFLICT(user_id, machine_id) DO UPDATE SET
      ads_progress = excluded.ads_progress,
      last_ad_ts = excluded.last_ad_ts
  `).run(userId, machineId, adsProgress, lastAdTs);
}

module.exports = {
  db,
  syncAndClose,
  // admins
  isAdminUsername, checkAdmin, seedAdmin, setAdminPassword, listAdmins,
  // settings
  getSettingsRaw, setSetting,
  // users
  getUser, createUser, getUserOrCreate, upsertFromStart,
  updateUserFields, addPoints, incCounter, incAdsToday, getAdsToday,
  getLeaderboard, getRank, getUserCount, getTotalPoints, getAllUsers,
  getTopEarners, getTopReferrers,
  // referrals
  createReferral, getReferralForUser, setReferralActive, setReferralInstant,
  countReferrals, listReferrals,
  // tasks
  hasClaimed, claimTask,
  listTasks, listTasksAll, getTask, addTask, updateTask, deleteTask, countTasksInDB,
  // gate
  listGateChannels, listGateChannelsAll, addGateChannel, updateGateChannel, deleteGateChannel,
  deleteAllGateChannels, repointTaskChannel, countGateChannels,
  // withdrawals
  createWithdrawal, getWithdrawal, listWithdrawals, listUserWithdrawals, getLastWithdrawal,
  countPendingWithdrawals, setWithdrawalApproved, setWithdrawalRejected,
  // broadcasts
  createBroadcast, updateBroadcastCount, listBroadcasts,
  // ads
  listAds, listAdsAll, getAd, addAd, updateAd, deleteAd, countAds,
  getAdClaim, updateAdClaim,
  // user admin
  listAllUsersAdmin, setUserBanned, adjustUserPoints, isUserBanned, deleteUser,
  // reward codes
  getRewardCode, listRewardCodes, createRewardCode, deleteRewardCode, toggleRewardCode,
  hasRewardCodeClaimed, claimRewardCode,
  // machine claims
  getMachineClaim, updateMachineClaim, updateMachineWatch,
  // gate diagnostics
  logGateAttempt, listGateLogs,
};
