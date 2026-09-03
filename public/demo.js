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
  var ADSG_LOGO = 'data:image/png;base64,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';
  var ADS = [
    { id: 1, name: 'Adsgram rewards', reward: 5,  daily_limit: 10, image: ADSG_LOGO, block_id: null },
    { id: 2, name: 'Adsgram Instant', reward: 5,  daily_limit: 10, image: ADSG_LOGO, block_id: null }
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
