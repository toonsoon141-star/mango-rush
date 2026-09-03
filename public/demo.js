/* ============================================================
   OFFLINE DEMO ENGINE — runs only when the backend is unreachable
   (e.g. opening index.html in a sandboxed preview with no network).
   Simulates the full API in-memory so every screen is tappable.
   ============================================================ */
window.DEMO = (function () {
  var MACHINES = [
    { id: 'start',  name: 'Start',  reward: 5,  ads: 1, per_day: 10, cooldown_hours: 1, icon: '🔧', color: '#a3e635' },
    { id: 'bronze', name: 'Bronze', reward: 10, ads: 2, per_day: 10, cooldown_hours: 1, icon: '🥉', color: '#cd7f32' },
    { id: 'silver', name: 'Silver', reward: 20, ads: 3, per_day: 10, cooldown_hours: 1, icon: '🥈', color: '#c0c0c0' }
  ];
  var GATE = [
    { title: 'Community',        channel: '@MangoRush_comminuty', url: 'https://t.me/MangoRush_comminuty' },
    { title: 'Free Crypto Hub',  channel: '@FreeCryptoHub_1',    url: 'https://t.me/FreeCryptoHub_1' },
    { title: 'Chat',             channel: '@mangoRush_chat',     url: 'https://t.me/mangoRush_chat' },
    { title: 'Payment',          channel: '@MangoRush_Proof',    url: 'https://t.me/MangoRush_Proof' }
  ];
  var TASKS = [
    { id: 1, category: 'main',    type: 'channel', title: 'Join our Community',      desc: 'Join our community channel', reward: 500, url: null, channel: '@MangoRush_comminuty', image: null },
    { id: 2, category: 'main',    type: 'link',    title: 'Follow us on X (Twitter)', desc: 'Follow our X (Twitter) account', reward: 300, url: 'https://x.com', channel: null, image: null },
    { id: 3, category: 'partner', type: 'link',    title: 'Partner: Visit site',      desc: 'Visit our partner site',       reward: 400, url: 'https://example.com', channel: null, image: null }
  ];
  var ADS = [
    { id: 1, name: 'Adsgram rewards', reward: 5,  daily_limit: 10, image: null, block_id: null },
    { id: 2, name: 'Adsgram Instant', reward: 5,  daily_limit: 10, image: null, block_id: null }
  ];
  var adClaims = {}; // ad_id -> {claim_date, claims_today}
  var STREAK_REWARDS = [10, 10, 10, 10, 10, 10, 10];

  var u = {
    id: 10001, username: 'demo', first_name: 'Demo User',
    points: 0,
    last_daily_ts: 0,
    ads_watched: 0, tasks_completed: 0,
    wallet_address: '', referrals: 0, commission_earned: 0,
    streak_count: 0, streak_date: '', today_earned: 0
  };
  var claimedTasks = {};
  var machine = {
    start:  { claims_today: 0, last_claim_ts: 0 },
    bronze: { claims_today: 0, last_claim_ts: 0 },
    silver: { claims_today: 0, last_claim_ts: 0 }
  };
  var withdrawals = [];

  function today() { return new Date().toISOString().slice(0, 10); }
  function yesterday() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10); }
  function usdt(coins) { return Math.round(coins * 0.0001 * 10000) / 10000; }
  function addPoints(n) { u.points += n; u.today_earned = (u.today_earned || 0) + n; }
  function fail(status, message) { return { __err: true, status: status, message: message }; }

  function pub() {
    return {
      id: u.id, username: u.username, first_name: u.first_name,
      points: u.points,
      referrals: u.referrals, last_daily_ts: u.last_daily_ts,
      daily_cooldown_ms: 86400000, daily_bonus: 500,
      app_name: 'MANGO RUSH', instant_reward: 30, active_reward: 70, commission_pct: 5,
      ads_watched: u.ads_watched, tasks_completed: u.tasks_completed, ads_target: 20, tasks_target: 5,
      my_referral_status: null,
      wallet_address: u.wallet_address, min_withdraw_usdt: 0.1, min_withdraw_coins: 1000,
      withdraw_fee_pct: 20, mango_to_usdt: 0.0001, withdraw_currency: 'USDT',
      streak_count: u.streak_count, streak_date: u.streak_date, streak_rewards: STREAK_REWARDS,
      today_earned: u.today_earned || 0
    };
  }

  function handle(method, path, body) {
    body = body || {};
    path = String(path).split('?')[0];

    if (path === '/api/auth') return { user: pub() };

    if (path === '/api/gate') {
      return {
        passed: false, demo: true,
        channels: GATE.map(function (c) { return { id: c.channel, title: c.title, channel: c.channel, url: c.url, image: null, joined: true }; }),
        app_name: 'MANGO RUSH', bot_username: 'Mango_Rush0_bot'
      };
    }

    if (path === '/api/claim-daily') {
      if (Date.now() - u.last_daily_ts < 86400000) return fail(400, 'Daily bonus already claimed');
      u.last_daily_ts = Date.now();
      addPoints(500);
      return { user: pub(), bonus: 500 };
    }

    if (path === '/api/claim-streak') {
      if (u.streak_date === today()) return fail(400, 'Streak already claimed today');
      var count = u.streak_date === yesterday() ? u.streak_count + 1 : 1;
      var reward = STREAK_REWARDS[(count - 1) % STREAK_REWARDS.length];
      u.streak_count = count; u.streak_date = today();
      addPoints(reward);
      return { ok: true, streak_count: count, reward: reward, user: pub() };
    }

    if (path === '/api/reward-code') {
      var code = String(body.code || '').trim().toUpperCase();
      if (code === 'MANGO100') { addPoints(100); return { ok: true, reward: 100, user: pub() }; }
      return fail(404, 'Invalid code');
    }

    if (path === '/api/machines') {
      var machines = MACHINES.map(function (m) {
        var ms = machine[m.id];
        var cooldownMs = (m.cooldown_hours || 1) * 3600000;
        var remainingMs = Math.max(0, (ms.last_claim_ts + cooldownMs) - Date.now());
        return {
          id: m.id, name: m.name, reward: m.reward, ads: m.ads, per_day: m.per_day,
          cooldown_hours: m.cooldown_hours, icon: m.icon, color: m.color,
          claims_today: ms.claims_today, remaining_today: Math.max(0, m.per_day - ms.claims_today),
          cooldown_ready: remainingMs <= 0, cooldown_remaining_ms: remainingMs
        };
      });
      return { machines: machines, user: pub() };
    }

    var mClaim = path.match(/^\/api\/machines\/([^/]+)\/claim$/);
    if (mClaim) {
      var m = MACHINES.filter(function (x) { return x.id === mClaim[1]; })[0];
      if (!m) return fail(404, 'Machine not found');
      var ms = machine[m.id];
      var cooldownMs = (m.cooldown_hours || 1) * 3600000;
      if (ms.claims_today >= m.per_day) return fail(400, 'Daily limit reached for this machine');
      if (Date.now() - ms.last_claim_ts < cooldownMs) return fail(400, 'Cooldown — wait a bit');
      ms.claims_today += 1; ms.last_claim_ts = Date.now();
      u.ads_watched += m.ads;
      addPoints(m.reward);
      return { ok: true, reward: m.reward, ads: m.ads, user: pub() };
    }

    if (path === '/api/tasks') {
      function decorate(t) {
        return { id: t.id, category: t.category, type: t.type, title: t.title, desc: t.desc, reward: t.reward, url: t.url, channel: t.channel, image: t.image || null, completed: !!claimedTasks[t.id], claimed: !!claimedTasks[t.id] };
      }
      return {
        main: TASKS.filter(function (t) { return t.category === 'main'; }).map(decorate),
        partner: TASKS.filter(function (t) { return t.category === 'partner'; }).map(decorate),
        ads: [],
        user: pub()
      };
    }

    var tClaim = path.match(/^\/api\/tasks\/(\d+)\/claim$/);
    if (tClaim) {
      var t = TASKS.filter(function (x) { return x.id === parseInt(tClaim[1], 10); })[0];
      if (!t) return fail(404, 'Task not found');
      if (claimedTasks[t.id]) return fail(400, 'Already claimed');
      claimedTasks[t.id] = true;
      u.tasks_completed += 1;
      addPoints(t.reward);
      return { ok: true, user: pub(), reward: t.reward };
    }

    if (path === '/api/ads') {
      var ads = ADS.map(function (a) {
        var c = adClaims[a.id] || { claim_date: '', claims_today: 0 };
        var claimedToday = c.claim_date === today() ? c.claims_today : 0;
        return {
          id: a.id, name: a.name, image: a.image, reward: a.reward,
          daily_limit: a.daily_limit, block_id: a.block_id,
          claimed_today: claimedToday,
          remaining_today: Math.max(0, a.daily_limit - claimedToday)
        };
      });
      return { ads: ads, user: pub() };
    }

    var aClaim = path.match(/^\/api\/ads\/(\d+)\/claim$/);
    if (aClaim) {
      var a = ADS.filter(function (x) { return x.id === parseInt(aClaim[1], 10); })[0];
      if (!a) return fail(404, 'Ad not found');
      var c = adClaims[a.id] || { claim_date: '', claims_today: 0 };
      var claimedToday = c.claim_date === today() ? c.claims_today : 0;
      if (claimedToday >= a.daily_limit) return fail(400, 'Daily limit reached for this ad');
      adClaims[a.id] = { claim_date: today(), claims_today: claimedToday + 1 };
      u.ads_watched += 1;
      addPoints(a.reward);
      return { ok: true, reward: a.reward, user: pub() };
    }

    if (path === '/api/referral') {
      return {
        link: 'https://t.me/Mango_Rush0_bot/mango?startapp=ref_10001',
        bot_username: 'Mango_Rush0_bot',
        instant_reward: 30, active_reward: 70, total_per_referral: 100, commission_pct: 5,
        ads_target: 20, tasks_target: 5,
        counts: { total: 0, active: 0, pending: 0 },
        earned: { instant: 0, active: 0, commission: 0, total: 0 },
        referrals: [],
        user: pub()
      };
    }

    if (path === '/api/wallet') {
      var cdMs = 10 * 3600000;
      var lastTs = withdrawals.length ? Date.parse(withdrawals[0].created_at) : 0;
      var remain = Math.max(0, (lastTs + cdMs) - Date.now());
      return {
        currency: 'USDT', address_label: 'USDT (BEP-20) address',
        mango_to_usdt: 0.0001, min_withdraw_usdt: 0.1, min_withdraw_coins: 1000, fee_pct: 20,
        balance: u.points, balance_usdt: usdt(u.points), wallet_address: u.wallet_address,
        requirements: {
          ads: { have: Math.min(u.ads_watched, 20), need: 20 },
          tasks: { have: Math.min(u.tasks_completed, 5), need: 5 },
          referrals: { have: Math.min(u.referrals, 3), need: 3 },
          met: u.ads_watched >= 20 && u.tasks_completed >= 5 && u.referrals >= 3
        },
        withdrawals: withdrawals,
        withdraw_cooldown: { cooldown_ms: cdMs, last_withdraw_ts: lastTs, ready: remain <= 0, retry_in_ms: remain }
      };
    }

    if (path === '/api/wallet/address') {
      var address = String(body.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail(400, 'Invalid USDT (BEP-20) address');
      u.wallet_address = address;
      return { ok: true, user: pub() };
    }

    if (path === '/api/withdraw') {
      var coins = Math.floor(parseFloat(body.coins));
      var address = String(body.address || u.wallet_address || '');
      if (!coins || isNaN(coins)) return fail(400, 'Enter a valid Mango amount');
      if (coins < 1000) return fail(400, 'Minimum withdraw is 1000 Mango (0.1 USDT)');
      if (coins > u.points) return fail(400, 'Not enough balance');
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail(400, 'Invalid USDT (BEP-20) address');

      var cdMs = 10 * 3600000;
      var lastTs = withdrawals.length ? Date.parse(withdrawals[0].created_at) : 0;
      if (Date.now() - lastTs < cdMs) {
        var wait = cdMs - (Date.now() - lastTs);
        var wm2 = Math.max(1, Math.ceil(wait / 60000));
        var wh2 = Math.floor(wm2 / 60);
        var wmin2 = wm2 % 60;
        return fail(400, 'Withdraw cooldown — next withdraw in ' + wh2 + 'h ' + wmin2 + 'm');
      }

      if (!(u.ads_watched >= 20 && u.tasks_completed >= 5 && u.referrals >= 3)) return fail(400, 'Complete the requirements to unlock withdrawals');
      var amountUsdt = usdt(coins);
      var feeUsdt = Math.round(amountUsdt * 20) / 100;
      var netUsdt = Math.round((amountUsdt - feeUsdt) * 10000) / 10000;
      u.points -= coins;
      var wd = { id: withdrawals.length + 1, amount: coins, amount_usdt: amountUsdt, fee_usdt: feeUsdt, net_usdt: netUsdt, address: address, status: 'pending', tx: null, created_at: new Date().toISOString() };
      withdrawals.unshift(wd);
      return { ok: true, withdrawal: wd, user: pub() };
    }

    return fail(404, 'Not found');
  }

  return { handle: handle };
})();
