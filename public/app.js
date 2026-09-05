/* ============================================================
   MANGO RUSH — frontend logic
   ============================================================ */

// Telegram WebApp is loaded lazily so it never blocks the app from starting.
function tg() { return (window.Telegram && window.Telegram.WebApp) || null; }

function loadTelegram() {
  return new Promise((resolve) => {
    if (window.Telegram && window.Telegram.WebApp) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.async = true;
    s.onload = finish;
    s.onerror = finish;
    document.head.appendChild(s);
    setTimeout(finish, 1500); // never block the app if the CDN is unreachable
  });
}

function initTelegram() {
  const t = tg();
  if (!t) return;
  try {
    t.ready(); t.expand();
    t.setHeaderColor('#0d1107');
    t.setBackgroundColor('#0d1107');
  } catch (e) { /* ignore */ }
}

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function fmt(n) { return Number(n).toLocaleString('en-US'); }

function authParams() {
  const p = new URLSearchParams();
  const t = tg();
  if (t) p.set('initData', t.initData || '');
  else {
    p.set('demo', '1');
    const sp = new URLSearchParams(location.search).get('startapp');
    if (sp) p.set('start_param', sp);
  }
  return p.toString();
}

function buildAuthBody(extra) {
  const body = Object.assign({}, extra || {});
  const t = tg();
  if (t) body.initData = t.initData || '';
  else {
    body.demo = true;
    const sp = new URLSearchParams(location.search).get('startapp');
    if (sp) body.start_param = sp;
  }
  return body;
}

async function api(method, path, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || 'Something went wrong');
      err.status = r.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e && e.status) throw e; // server rejected — surface the real message
    // Network unreachable (offline / sandboxed preview) — run the in-memory demo.
    if (window.DEMO && window.DEMO.handle) {
      const d = window.DEMO.handle(method, path, body);
      if (d && d.__err) { const err = new Error(d.message || 'Demo error'); err.status = d.status; throw err; }
      return d;
    }
    throw e;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- state ----------
let user = null;

// ---------- UI update ----------
// Renders the user's Telegram profile picture in the top bar (fallback: first letter).
function renderAvatar(photoUrl, name) {
  const el = $('topAvatar');
  if (!el) return;
  const initial = (name || 'U').charAt(0).toUpperCase();
  if (photoUrl) {
    el.textContent = '';
    el.style.backgroundImage = `url(${photoUrl})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.color = 'transparent';
  } else {
    el.style.backgroundImage = '';
    el.style.color = '';
    el.textContent = initial;
  }
}

function applyUser(u) {
  user = u;

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  $('appName').textContent = u.app_name || 'MANGO RUSH';
  setTxt('refInstant', fmt(u.instant_reward));
  setTxt('refActive', fmt(u.active_reward));
  setTxt('refCommissionPct', u.commission_pct);
  setTxt('refTotalReward', fmt((u.instant_reward || 0) + (u.active_reward || 0)));
  $('withdrawAddress').value = u.wallet_address || '';

  // top bar identity
  const name = u.first_name || u.username || 'User';
  $('topName').textContent = name;
  $('topId').textContent = u.id;
  renderAvatar(u.photo_url, name);

  // admin shortcut (only visible to admins)
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) adminBtn.classList.toggle('hidden', !u.is_admin);

  // home
  $('homeBalance').textContent = fmt(u.points);
  $('homeTotal').textContent = fmt(u.points);
  $('todayEarned').textContent = '+' + fmt(u.today_earned || 0);
  $('homeBalanceUsdt').textContent = '= ' + ((u.points * (u.mango_to_usdt || 0.0001)).toFixed(4)) + ' USDT';
  setTxt('adsCounter', `${u.ads_watched || 0}/${u.ads_target || 20}`);

  renderStreak();
  renderActivation();
}

// ---------- streak ----------
function renderStreak() {
  if (!user) return;
  const rewards = user.streak_rewards || [10, 10, 10, 10, 10, 10, 10];
  const count = user.streak_count || 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const claimedToday = user.streak_date === todayStr;

  $('streakText').textContent = `day ${Math.min(count, rewards.length)} of ${rewards.length}`;

  const days = $('streakDays');
  days.innerHTML = '';
  rewards.forEach((r, i) => {
    const d = document.createElement('div');
    const dayNum = i + 1;
    let cls = 'streak-day';
    if (i < count) cls += ' done';
    if (!claimedToday && i === (count % rewards.length)) cls += ' today';
    d.className = cls;
    d.innerHTML = `<span class="sd-v">${r}</span><span>D${dayNum}</span>`;
    days.appendChild(d);
  });

  const btn = $('streakClaimBtn');
  if (claimedToday) {
    btn.disabled = true;
    btn.textContent = '✅ Claimed today — come back tomorrow';
  } else {
    btn.disabled = false;
    const next = rewards[count % rewards.length] || rewards[0];
    btn.textContent = `🎁 Claim streak reward (+${next})`;
  }
}

async function claimStreak() {
  try {
    const r = await api('POST', '/api/claim-streak', buildAuthBody());
    applyUser(r.user);
    toast(`🔥 Streak day ${r.streak_count}! +${fmt(r.reward)} Mango`, 2600);
  } catch (e) { toast(e.message); }
}

// ---------- reward code ----------
function openRewardCode() {
  $('rewardModal').classList.remove('hidden');
  $('rewardCodeInput').value = '';
}
function closeRewardCode() {
  $('rewardModal').classList.add('hidden');
}
async function claimRewardCode() {
  const code = $('rewardCodeInput').value.trim();
  if (!code) return toast('Enter a code');
  try {
    const r = await api('POST', '/api/reward-code', buildAuthBody({ code }));
    applyUser(r.user);
    closeRewardCode();
    toast(`🎁 +${fmt(r.reward)} Mango!`, 2600);
  } catch (e) { toast(e.message); }
}

// ---------- boot ----------
async function boot() {
  await loadTelegram();
  initTelegram();
  await loadUser().catch(() => {});
  const minWait = new Promise((r) => setTimeout(r, 1500));
  await minWait;
  $('loading').classList.add('hidden');

  try {
    const gate = await api('GET', '/api/gate?' + authParams());
    if (gate.passed && !gate.demo) enterApp();
    else {
      // If the server returned a channel list, re-render it (updates joined status).
      // Otherwise the pre-rendered channels stay visible.
      if (gate.channels && gate.channels.length) renderGate(gate.channels, gate.demo);
      $('gate').classList.remove('hidden');
    }
  } catch (e) {
    // Not inside Telegram (no initData) → server returns 401. Say it clearly.
    if (e && e.status === 401) renderGateError();
    $('gate').classList.remove('hidden');
  }
}

function renderGateError() {
  $('gateSub').textContent = '⚠️ Could not verify your Telegram session. Please open MANGO RUSH from the "Open MANGO RUSH" button inside the @Mango_Rush0_bot chat.';
}

// Failsafe — never leave the user stuck on the loading screen.
setTimeout(() => {
  const l = document.getElementById('loading');
  if (l && !l.classList.contains('hidden')) l.classList.add('hidden');
}, 7000);

function enterApp() {
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
  setupLeaderboardTabs();
  loadLeaderboard();
}

async function checkGate() {
  const btn = $('gateCheckBtn');
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Checking…';
  try {
    const gate = await api('GET', '/api/gate?fresh=1&' + authParams());
    if (gate.channels && gate.channels.length) renderGate(gate.channels, gate.demo);
    if (gate.passed && !gate.demo) enterApp();
    else if (gate.demo || !gate.channels.length) enterApp();
    else toast('❌ Join all 4 channels first — then come back and verify');
  } catch (e) {
    if (e && e.status === 401) renderGateError();
    toast('⚠️ Verification failed. Open MANGO RUSH from the bot chat (@Mango_Rush0_bot).');
  }
  btn.disabled = false;
  btn.textContent = prev;
}

function renderGate(channels, demo) {
  const list = $('gateList');
  list.innerHTML = '';
  const total = channels.length;
  $('gateSub').textContent = demo
    ? `Demo mode — join all ${total} channels to unlock. Verification is simulated.`
    : `Join all ${total} channels to unlock MANGO RUSH. Verification is automatic.`;

  channels.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'gate-item';
    const img = document.createElement('div');
    if (c.image) {
      img.className = 'gate-img';
      img.style.backgroundImage = `url(${c.image})`;
      img.style.backgroundSize = 'cover';
      img.style.backgroundPosition = 'center';
    } else {
      img.className = 'gate-img placeholder';
      img.textContent = '📢';
    }
    const body = document.createElement('div');
    body.className = 'gate-item-body';
    body.innerHTML = `
      <div class="gate-item-title">${escapeHtml(c.title)}</div>
      <div class="gate-item-channel">${escapeHtml(c.channel)}</div>
      <div class="gate-count">Channel ${i + 1} of ${total}</div>`;
    const join = document.createElement('button');
    let label = 'Join';
    if (c.joined) { label = '✓ Joined'; }
    else if (c.status === 'error') { label = '⚠️ Retry'; }
    else if (c.status === 'left' || c.status === 'kicked') { label = 'Join'; }
    join.className = 'gate-join' + (c.joined ? ' joined' : '') + (c.status === 'error' ? ' gate-err' : '');
    join.textContent = label;
    join.onclick = () => openLink(c.url);
    item.appendChild(img); item.appendChild(body); item.appendChild(join);
    list.appendChild(item);
  });
}

function openLink(url) {
  const t = tg();
  if (t) t.openLink(url);
  else window.open(url, '_blank');
}

// ---------- machines (Mine) ----------
let _machines = [];

async function loadMachines() {
  try {
    const r = await api('GET', '/api/machines?' + authParams());
    if (r.user) applyUser(r.user);
    _machines = r.machines || [];
    renderMachines();
  } catch (e) { toast(e.message); }
}

function renderMachines() {
  const list = $('machineList');
  list.innerHTML = '';
  _machines.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'machine-card';
    card.innerHTML = `
      <div class="machine-top">
        <div class="machine-icon" style="background:${escapeHtml(m.color || '#253012')}22;${m.image ? `background-image:url(${m.image});background-size:cover;background-position:center;` : ''}">${m.image ? '' : (m.icon || '🔧')}</div>
        <div class="task-body">
          <div class="machine-name">MACHINE · ${escapeHtml(m.name)}</div>
          <div class="machine-per">+${fmt(m.reward)} Mango PER CLAIM</div>
          <div class="machine-meta">${m.ads} ad${m.ads === 1 ? '' : 's'} per claim · ${m.per_day}/day · ${m.cooldown_hours}h cooldown</div>
        </div>
      </div>
      <div class="machine-progress">
        <div class="mbar"><div class="mbar-fill" style="width:${Math.min(100, (m.ads_done / Math.max(1, m.ads)) * 100)}%;"></div></div>
        <div class="mbar-text">📺 ${m.ads_done}/${m.ads} ads watched · ⛏️ ${m.claims_today}/${m.per_day} today</div>
      </div>
      <div class="machine-actions" id="mact-${m.id}" style="margin-top:12px;"></div>`;
    list.appendChild(card);
  });
  renderMachineActions();
}

function renderMachineActions() {
  _machines.forEach((m) => {
    const box = document.getElementById('mact-' + m.id);
    if (!box) return;
    box.innerHTML = '';
    let btn;

    if (m.claim_ready) {
      btn = mkBtn('✅ Claim +' + fmt(m.reward) + ' Mango', 'btn-gold', false);
      btn.onclick = () => claimMachine(m.id);
    } else if (!m.cooldown_ready) {
      btn = mkBtn(`⏳ ${Math.ceil(m.cooldown_remaining_ms / 60000)}m cooldown`, 'btn-ghost', true);
    } else if (m.remaining_today <= 0) {
      btn = mkBtn('✅ Daily limit reached', 'btn-ghost', true);
    } else if (m.ad_cooldown_remaining_ms > 0 && m.ads_done > 0) {
      btn = mkBtn(`⏳ next ad in ${Math.ceil(m.ad_cooldown_remaining_ms / 1000)}s`, 'btn-ghost', true);
    } else {
      btn = mkBtn(`▶️ Watch Ad ${m.ads_done + 1}/${m.ads}`, 'btn-primary', false);
      btn.onclick = () => watchMachine(m);
    }
    box.appendChild(btn);
  });
}

function mkBtn(text, cls, disabled) {
  const b = document.createElement('button');
  b.className = cls;
  b.style.width = '100%';
  b.textContent = text;
  b.disabled = !!disabled;
  return b;
}

// Live countdown for machine cooldowns (1s tick, client-side decrement).
let _machineTick = null;
function startMachineTick() {
  if (_machineTick) return;
  _machineTick = setInterval(() => {
    if (!$('screen-mine').classList.contains('active')) return;
    let changed = false;
    _machines.forEach((m) => {
      if (m.cooldown_remaining_ms > 0) { m.cooldown_remaining_ms = Math.max(0, m.cooldown_remaining_ms - 1000); changed = true; }
      if (m.ad_cooldown_remaining_ms > 0) { m.ad_cooldown_remaining_ms = Math.max(0, m.ad_cooldown_remaining_ms - 1000); changed = true; }
    });
    if (changed) renderMachineActions();
  }, 1000);
}

async function watchMachine(m) {
  // If an Adsgram block is configured, the ad must be watched to the end.
  if (m.block_id) {
    const box = document.getElementById('mact-' + m.id);
    if (box && box.firstChild) { box.firstChild.disabled = true; box.firstChild.textContent = '⏳ Loading ad…'; }
    try {
      await showAdsgramAd(String(m.block_id));
    } catch (res) {
      if (box && box.firstChild) { box.firstChild.disabled = false; }
      const state = (res && res.state) || '';
      if (state === 'skip' || (res && res.done === false && !res.error)) toast('👋 Ad skipped — watch the full ad');
      else if (state === 'bannerNotFound') toast('⚠️ No ad available right now, try again later');
      else toast('⚠️ Ad unavailable right now, try again');
      return;
    }
  }

  try {
    const r = await api('POST', `/api/machines/${m.id}/watch`, buildAuthBody());
    applyUser(r.user);
    if (r.machine) {
      const idx = _machines.findIndex((x) => x.id === m.id);
      if (idx >= 0) _machines[idx] = r.machine;
    }
    if (r.ads_done >= r.ads_needed) toast('📺 All ads watched — claim your reward!', 2200);
    else toast(`📺 Ad ${r.ads_done}/${r.ads_needed} watched`, 1600);
    renderMachines();
  } catch (e) {
    toast(e.message);
    // refresh to resync the 15s countdown if the server said "wait"
    loadMachines();
  }
}

async function claimMachine(id) {
  try {
    const r = await api('POST', `/api/machines/${id}/claim`, buildAuthBody());
    applyUser(r.user);
    toast(`⛏️ +${fmt(r.reward)} Mango!`, 2400);
    loadMachines();
  } catch (e) {
    toast(e.message);
    loadMachines();
  }
}

// ---------- tasks ----------
const TASK_ICONS = { channel: '📢', link: '🔗', ads: '📺' };

async function loadTasks() {
  try {
    const r = await api('GET', '/api/tasks?' + authParams());
    if (r.user) applyUser(r.user);
    renderTaskList($('taskListMain'), r.main);
    renderTaskList($('taskListPartner'), r.partner);
    if ($('taskListAds')) renderTaskList($('taskListAds'), r.ads);
  } catch (e) { toast(e.message); }
}

function renderTaskList(el, tasks) {
  el.innerHTML = '';
  if (!tasks || !tasks.length) { el.innerHTML = '<div class="screen-sub">No tasks yet</div>'; return; }
  tasks.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'task-item';
    const iconHtml = t.image
      ? `<div class="task-icon" style="background-image:url('${t.image}');background-size:cover;background-position:center;"></div>`
      : `<div class="task-icon">${TASK_ICONS[t.type] || '✅'}</div>`;
    item.innerHTML = `
      ${iconHtml}
      <div class="task-body">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-desc">${escapeHtml(t.desc)}</div>
        <div class="task-reward">+${fmt(t.reward)} Mango</div>
      </div>
      <div class="task-actions"></div>`;
    const actions = item.querySelector('.task-actions');

    if (t.claimed) {
      const done = document.createElement('button');
      done.className = 'task-btn done';
      done.textContent = '✓ Done';
      actions.appendChild(done);
    } else {
      if (t.type === 'channel' && !t.completed && t.channel) {
        const go = document.createElement('button');
        go.className = 'task-btn go';
        go.textContent = 'Join';
        go.onclick = () => openLink('https://t.me/' + String(t.channel).replace(/^@/, ''));
        actions.appendChild(go);
      } else if (t.url) {
        const go = document.createElement('button');
        go.className = 'task-btn go';
        go.textContent = 'Start';
        go.onclick = () => openLink(t.url);
        actions.appendChild(go);
      }
      const claim = document.createElement('button');
      claim.className = 'task-btn claim';
      claim.textContent = 'Claim';
      claim.onclick = () => claimTask(t.id, claim);
      actions.appendChild(claim);
    }
    el.appendChild(item);
  });
}

async function claimTask(id, btn) {
  btn.disabled = true;
  try {
    const r = await api('POST', `/api/tasks/${id}/claim`, buildAuthBody());
    applyUser(r.user);
    toast(`✅ +${fmt(r.reward)} Mango!`);
    loadTasks();
  } catch (e) {
    btn.disabled = false;
    toast(e.message);
  }
}

// ---------- watch & earn ads ----------
async function loadAds() {
  try {
    const r = await api('GET', '/api/ads?' + authParams());
    if (r.user) applyUser(r.user);
    const list = $('adList');
    list.innerHTML = '';

    let watchedToday = 0, remaining = 0;
    r.ads.forEach((a) => { watchedToday += a.claimed_today; remaining += a.remaining_today; });
    const sum = $('adsSummary');
    if (sum) {
      sum.innerHTML = `
        <div class="today-card"><div class="today-label">TODAY'S ADS</div><div class="today-value">${fmt(watchedToday)}</div></div>
        <div class="today-card"><div class="today-label">REMAINING</div><div class="today-value">${fmt(remaining)}</div></div>`;
    }

    if (!r.ads.length) { list.innerHTML = '<div class="screen-sub">No ads available right now</div>'; return; }

    r.ads.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'earn-card';
      const imgHtml = a.image
        ? `<div class="ad-logo" style="background-image:url('${a.image}');"></div>`
        : `<div class="ad-logo ad-logo-ph">📺</div>`;
      const done = a.remaining_today <= 0;
      card.innerHTML = `
        <div class="ad-card-row">
          ${imgHtml}
          <div class="ad-card-main">
            <div class="task-title">${escapeHtml(a.name)}</div>
            <div class="task-reward" style="margin-top:4px;">+${fmt(a.reward)} Mango per ad · ${a.claimed_today}/${a.daily_limit} today</div>
            <button class="btn-primary ad-claim" data-ad="${a.id}" style="margin-top:10px;" ${done ? 'disabled' : ''}>${done ? '✅ Daily limit reached' : '▶️ Watch Ad Now'}</button>
          </div>
        </div>`;
      card.querySelector('.ad-claim').onclick = () => claimAd(a);
      list.appendChild(card);
    });
  } catch (e) { toast(e.message); }
}

// ---------- Adsgram rewarded ad integration ----------
const adControllers = {};

// Lazy-load the Adsgram SDK once, without ever blocking the app.
function loadAdsgram() {
  return new Promise((resolve) => {
    if (window.Adsgram && window.Adsgram.init) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const s = document.createElement('script');
    s.src = 'https://sad.adsgram.ai/js/sad.min.js';
    s.async = true;
    s.onload = finish;
    s.onerror = finish;
    document.head.appendChild(s);
    setTimeout(finish, 3000); // never hang if the CDN is unreachable
  });
}

function getAdController(blockId) {
  if (adControllers[blockId]) return adControllers[blockId];
  if (window.Adsgram && window.Adsgram.init) {
    adControllers[blockId] = window.Adsgram.init({ blockId });
    return adControllers[blockId];
  }
  return null;
}

// Resolves when the user watches the ad to the end; rejects on skip / error / no ad.
function showAdsgramAd(blockId) {
  return new Promise(async (resolve, reject) => {
    await loadAdsgram();
    const ctrl = getAdController(blockId);
    if (!ctrl) {
      reject({ error: true, done: false, state: 'load', description: 'Adsgram script not loaded' });
      return;
    }
    ctrl.show().then((result) => resolve(result)).catch((result) => reject(result || { error: true, done: false, state: 'error' }));
  });
}

async function claimAd(a) {
  // If a real Adsgram block is configured, the user must watch the full ad
  // before the reward is granted.
  if (a.block_id) {
    const btn = document.querySelector(`.ad-claim[data-ad="${a.id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading ad…'; }
    try {
      await showAdsgramAd(String(a.block_id));
    } catch (res) {
      if (btn) { btn.disabled = false; btn.textContent = '▶️ Watch Ad Now'; }
      const state = (res && res.state) || '';
      if (state === 'skip' || (res && res.done === false && !res.error)) {
        toast('👋 Ad skipped — watch the full ad to earn Mango');
      } else if (state === 'bannerNotFound') {
        toast('⚠️ No ad available right now, try again later');
      } else {
        toast('⚠️ Ad unavailable right now, try again');
      }
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = '▶️ Watch Ad Now'; }
  }

  // Ad watched (or no block configured) — grant the reward server-side.
  try {
    const r = await api('POST', `/api/ads/${a.id}/claim`, buildAuthBody());
    applyUser(r.user);
    toast(`📺 +${fmt(r.reward)} Mango!`, 2400);
    loadAds();
  } catch (e) { toast(e.message); }
}

// ---------- referral ----------
async function loadReferral() {
  try {
    const r = await api('GET', '/api/referral?' + authParams());
    if (r.user) applyUser(r.user);

    $('refLink').textContent = r.link || 'Set BOT_USERNAME in config';
    $('refTotal').textContent = fmt(r.counts.total);
    $('refActiveCount').textContent = fmt(r.counts.active);
    $('refEarned').textContent = fmt(r.earned.total);
    $('refCommissionPct').textContent = r.commission_pct;
    $('refTotalReward').textContent = fmt(r.total_per_referral);
    window._refLink = r.link;

    // rewards breakdown
    $('refBreakdown').innerHTML = `
      <div class="breakdown-item"><span>💰</span><span><b>+${fmt(r.instant_reward)}</b> instant when a friend joins via your link</span></div>
      <div class="breakdown-item"><span>🚀</span><span><b>+${fmt(r.active_reward)}</b> when they complete ${fmt(r.ads_target)} ads + ${fmt(r.tasks_target)} tasks</span></div>
      <div class="breakdown-item"><span>♾️</span><span><b>${r.commission_pct}%</b> of everything they earn — forever</span></div>`;

    const list = $('refList');
    list.innerHTML = '';
    if (!r.referrals.length) { list.innerHTML = '<div class="screen-sub">No referrals yet — share your link!</div>'; return; }
    r.referrals.forEach((rf) => {
      const item = document.createElement('div');
      item.className = 'task-item';
      const active = rf.status === 'active';
      item.innerHTML = `
        <div class="task-icon">${active ? '✅' : '⏳'}</div>
        <div class="task-body">
          <div class="task-title">${escapeHtml(rf.first_name || rf.username || 'User ' + rf.user_id)} <span class="wd-badge ${active ? 'approved' : 'pending'}">${active ? 'active' : 'pending'}</span></div>
          <div class="task-desc">${new Date(rf.created_at).toLocaleDateString()}</div>
        </div>`;
      list.appendChild(item);
    });
  } catch (e) { toast(e.message); }
}

function copyLink() {
  const link = window._refLink;
  if (!link) return toast('No link yet');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => toast('📋 Link copied!'), () => fallbackCopy(link));
  else fallbackCopy(link);
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('📋 Link copied!'); } catch { toast('Copy failed'); }
  ta.remove();
}
function invite() {
  const link = window._refLink;
  if (!link) return;
  const t = tg();
  if (t && t.openTelegramLink) t.openTelegramLink(link);
  else openLink(link);
}

// ---------- activation (for users who joined via a link) ----------
function renderActivation() {
  const card = $('activationCard');
  if (!user || !user.my_referral_status) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const ads = user.ads_watched || 0, adsT = user.ads_target || 20;
  const tasks = user.tasks_completed || 0, tasksT = user.tasks_target || 5;
  $('adsProgress').style.width = Math.min(100, (ads / adsT) * 100) + '%';
  $('adsProgressText').textContent = `Ads ${ads}/${adsT}`;
  $('tasksProgress').style.width = Math.min(100, (tasks / tasksT) * 100) + '%';
  $('tasksProgressText').textContent = `Tasks ${tasks}/${tasksT}`;
}

// ---------- wallet ----------
let walletInfo = null;
async function loadWallet() {
  try {
    const r = await api('GET', '/api/wallet?' + authParams());
    walletInfo = r;
    $('walletBalance').textContent = fmt(r.balance);
    $('walletBalanceUsdt').textContent = r.balance_usdt + ' ' + r.currency;
    $('walletAddrLabel').textContent = r.address_label;
    $('walletRate').textContent = `${fmt(Math.round(1 / r.mango_to_usdt))} Mango = 1 ${r.currency}`;
    $('walletMinHint').textContent = r.max_withdraw_coins > 0
      ? `(min ${fmt(r.min_withdraw_coins)} · max ${fmt(r.max_withdraw_coins)})`
      : `(min ${fmt(r.min_withdraw_coins)})`;
    $('withdrawAddress').placeholder = '0x… (42 characters)';
    if (!user.wallet_address && r.wallet_address) $('withdrawAddress').value = r.wallet_address;
    renderWalletIdentity();
    renderRequirements(r.requirements);
    renderWithdrawCooldown(r.withdraw_cooldown);
    renderWithdrawals(r.withdrawals);
    updateWithdrawConvert();
  } catch (e) { toast(e.message); }
}

// Withdraw cooldown UI (must wait N hours between withdrawals)
function renderWithdrawCooldown(cd) {
  const el = $('withdrawCooldown');
  const btn = $('withdrawBtn');
  if (!cd) { el.classList.add('hidden'); return; }

  if (cd.ready) {
    el.classList.add('hidden');
    btn.disabled = false;
    return;
  }

  // Not ready yet — block the button
  btn.disabled = true;
  el.classList.remove('hidden');
  window._wdRetryAt = Date.now() + (cd.retry_in_ms || 0);

  const tick = () => {
    const remain = (window._wdRetryAt || 0) - Date.now();
    if (remain <= 0) {
      el.classList.add('hidden');
      const reqsMet = walletInfo && walletInfo.requirements && walletInfo.requirements.met;
      btn.disabled = !reqsMet;
      return;
    }
    const s = Math.ceil(remain / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = `⏳ Next withdraw available in ${h}h ${pad(m)}m ${pad(sec)}s`;
  };
  tick();
  clearInterval(window._wdTick);
  window._wdTick = setInterval(tick, 1000);
}

function renderWalletIdentity() {
  if (!user) return;
  const name = user.first_name || user.username || 'User';
  $('walletUsername').textContent = name;
  $('walletUserId').textContent = user.id;
  const el = $('walletAvatar');
  if (el) {
    if (user.photo_url) {
      el.textContent = '';
      el.style.backgroundImage = `url(${user.photo_url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.color = 'transparent';
    } else {
      el.style.backgroundImage = '';
      el.style.color = '';
      el.textContent = name.charAt(0).toUpperCase();
    }
  }
}

function renderRequirements(reqs) {
  if (!reqs) return;
  // Requirements disabled by admin → hide the bars, unlock withdraw
  if (reqs.enabled === false) {
    const wr = document.getElementById('walletReqs');
    if (wr) wr.classList.add('hidden');
    $('withdrawBtn').disabled = false;
    $('withdrawLocked').classList.add('hidden');
    return;
  }
  const wr = document.getElementById('walletReqs');
  if (wr) wr.classList.remove('hidden');
  const set = (fillEl, countEl, have, need) => {
    fillEl.style.width = Math.min(100, (have / Math.max(1, need)) * 100) + '%';
    countEl.textContent = `${have}/${need}`;
  };
  set($('reqAdsFill'), $('reqAdsCount'), reqs.ads.have, reqs.ads.need);
  set($('reqRefsFill'), $('reqRefsCount'), reqs.referrals.have, reqs.referrals.need);
  set($('reqTasksFill'), $('reqTasksCount'), reqs.tasks.have, reqs.tasks.need);

  const btn = $('withdrawBtn');
  const locked = $('withdrawLocked');
  if (reqs.met) { btn.disabled = false; locked.classList.add('hidden'); }
  else { btn.disabled = true; locked.classList.remove('hidden'); }
}

function renderWithdrawals(list) {
  const el = $('withdrawHistory');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div class="screen-sub">No withdrawals yet</div>'; return; }
  list.forEach((w) => {
    const item = document.createElement('div');
    item.className = 'task-item';
    const cur = (walletInfo && walletInfo.currency) || 'USDT';
    let detail = `${w.amount_usdt} ${cur}`;
    if (w.status === 'approved') detail += ` → paid ${w.net_usdt} ${cur}`;
    if (w.status === 'rejected') detail += ` (refunded)`;
    item.innerHTML = `
      <div class="task-icon">${w.status === 'approved' ? '✅' : w.status === 'rejected' ? '❌' : '⏳'}</div>
      <div class="task-body">
        <div class="task-title">${detail} <span class="wd-badge ${w.status}">${w.status}</span></div>
        <div class="task-desc">${escapeHtml(w.address)}</div>
        ${w.tx ? `<div class="task-desc" style="word-break:break-all;">Tx: ${escapeHtml(w.tx)}</div>` : ''}
        <div class="task-desc">${new Date(w.created_at).toLocaleString()}</div>
      </div>`;
    el.appendChild(item);
  });
}

function updateWithdrawConvert() {
  const coins = Math.floor(parseFloat($('withdrawAmount').value));
  const cur = walletInfo ? walletInfo.currency : 'USDT';
  const rate = walletInfo ? walletInfo.mango_to_usdt : 0.0001;
  const feePct = walletInfo ? walletInfo.fee_pct : 20;
  const gross = coins > 0 && !isNaN(coins) ? coins * rate : 0;
  const fee = gross * (feePct / 100);
  const net = gross - fee;
  const fmtU = (n) => n.toFixed(4) + ' ' + cur;
  $('wdGross').textContent = fmtU(gross);
  $('wdFee').textContent = '-' + fmtU(fee);
  $('wdNet').textContent = fmtU(net);
}

async function requestWithdraw() {
  const coins = Math.floor(parseFloat($('withdrawAmount').value));
  const address = $('withdrawAddress').value.trim();
  if (!coins || isNaN(coins)) return toast('Enter a Mango amount');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return toast('❌ Invalid BEP-20 address — must start with 0x and be 42 characters');
  }
  try {
    const r = await api('POST', '/api/withdraw', buildAuthBody({ coins, address }));
    applyUser(r.user);
    $('withdrawAmount').value = '';
    toast('💸 Withdraw request sent!');
    loadWallet();
  } catch (e) { toast(e.message); }
}

// ---------- leaderboard (home) ----------
let _lbData = null;
let _lbMode = 'earn'; // 'earn' | 'ref'

async function loadLeaderboard() {
  try {
    const r = await api('GET', '/api/leaderboard?' + authParams());
    _lbData = r;
    renderLeaderboard();
  } catch (e) {
    const list = $('lbList');
    if (list) list.innerHTML = '<div class="screen-sub">Leaderboard unavailable</div>';
  }
}

function renderLeaderboard() {
  const list = $('lbList');
  if (!list || !_lbData) return;
  const rows = (_lbMode === 'ref' ? _lbData.top_referrers : _lbData.top_earners) || [];
  list.innerHTML = '';

  if (!rows.length) {
    list.innerHTML = '<div class="screen-sub">No players yet — be the first! 🥭</div>';
  }

  const medals = ['🥇', '🥈', '🥉'];
  rows.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'lb-row' + (i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '');
    const name = row.first_name || (row.username ? '@' + row.username : 'User ' + String(row.id).slice(-4));
    const isMe = user && row.id === user.id;
    const val = _lbMode === 'ref'
      ? `${fmt(row.referrals)} <small>refs</small>`
      : `${fmt(row.points)} <small>🥭</small>`;
    const avaHtml = row.photo_url
      ? `<div class="lb-ava" style="background-image:url('${escapeHtml(row.photo_url)}');background-size:cover;background-position:center;"></div>`
      : `<div class="lb-ava">${escapeHtml((name[0] || 'U').toUpperCase())}</div>`;
    div.innerHTML = `
      <div class="lb-rank ${i < 3 ? 'medal' : ''}">${i < 3 ? medals[i] : row.rank}</div>
      ${avaHtml}
      <div class="lb-name">${escapeHtml(name)}${isMe ? ' <small style="color:#a3e635;">(you)</small>' : ''}</div>
      <div class="lb-val">${val}</div>`;
    list.appendChild(div);
  });

  // "me" strip — show my stats if I'm not in the visible top list
  const meEl = $('lbMe');
  if (meEl) {
    const me = _lbData.me;
    const inList = me && rows.some((r) => r.id === me.id);
    if (me && !inList) {
      const myVal = _lbMode === 'ref'
        ? `${fmt(me.referrals || 0)} <small>refs</small>`
        : `${fmt(me.points || 0)} <small>🥭</small>`;
      meEl.innerHTML = `<span>📍 You</span><span class="lb-val">${myVal}</span>`;
      meEl.classList.remove('hidden');
    } else {
      meEl.classList.add('hidden');
    }
  }
}

function setupLeaderboardTabs() {
  const te = $('lbTabEarn'), tr = $('lbTabRef');
  if (!te || !tr) return;
  te.onclick = () => { _lbMode = 'earn'; te.classList.add('active'); tr.classList.remove('active'); renderLeaderboard(); };
  tr.onclick = () => { _lbMode = 'ref'; tr.classList.add('active'); te.classList.remove('active'); renderLeaderboard(); };
}

// ---------- navigation ----------
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-screen').forEach((s) => s.classList.remove('active'));
      $('screen-' + btn.dataset.tab).classList.add('active');

      const t = btn.dataset.tab;
      if (t === 'home') loadLeaderboard();
      if (t === 'mine') loadMachines();
      if (t === 'task') loadTasks();
      if (t === 'earn') loadAds();
      if (t === 'referral') loadReferral();
      if (t === 'wallet') loadWallet();
    });
  });
}

// ---------- init ----------
async function loadUser() {
  try {
    const r = await api('POST', '/api/auth', buildAuthBody());
    applyUser(r.user);
  } catch (e) {
    toast('Could not authenticate: ' + e.message, 4000);
  }
}

// kickoff
setupNav();
startMachineTick();
$('adminBtn').addEventListener('click', () => {
  // Stay INSIDE the Telegram webview — navigate the current view, not an external browser.
  const url = location.origin + '/admin.html';
  window.location.href = url;
});
$('gateCheckBtn').addEventListener('click', checkGate);
const _proofBtn = document.getElementById('proofViewBtn');
if (_proofBtn) _proofBtn.addEventListener('click', () => {
  const t = tg();
  const url = 'https://t.me/MangoRush_Proof';
  if (t && t.openTelegramLink) t.openTelegramLink(url); // opens inside Telegram
  else openLink(url);
});
$('streakClaimBtn').addEventListener('click', claimStreak);
$('rewardCodeBtn').addEventListener('click', openRewardCode);
$('rewardCodeCloseBtn').addEventListener('click', closeRewardCode);
$('rewardCodeClaimBtn').addEventListener('click', claimRewardCode);
$('homeWithdrawBtn').addEventListener('click', () => {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-screen').forEach((s) => s.classList.remove('active'));
  $('screen-wallet').classList.add('active');
  document.querySelector('.nav-btn[data-tab="wallet"]').classList.add('active');
  loadWallet();
});
$('copyLinkBtn').addEventListener('click', copyLink);
$('inviteBtn').addEventListener('click', invite);
$('withdrawBtn').addEventListener('click', requestWithdraw);
$('withdrawAmount').addEventListener('input', updateWithdrawConvert);

boot();
