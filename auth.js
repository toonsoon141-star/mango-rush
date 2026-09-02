// ============================================================
//  Telegram Mini App initData verification (HMAC-SHA256)
// ============================================================

const crypto = require('crypto');

/**
 * Builds the data-check-string from RAW initData (values NOT url-decoded),
 * then validates the HMAC-SHA256 signature exactly like Telegram does.
 */
function buildDataCheckString(initData) {
  return initData
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const idx = pair.indexOf('=');
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    })
    .filter(([key]) => key !== 'hash')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function verifyInitData(initData, botToken, { maxAgeSec = 86400 } = {}) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(buildDataCheckString(initData))
    .digest('hex');

  // constant-time compare
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // auth_date must be fresh
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSec) return null;

  let user = null;
  const userStr = params.get('user');
  if (userStr) {
    try { user = JSON.parse(userStr); } catch { /* ignore */ }
  }

  return {
    user,
    startParam: params.get('start_param') || null,
  };
}

/**
 * Diagnostic: explain WHY an initData failed verification.
 * Returns { reason, fields, hash_ok, auth_date_ok, user_ok }.
 */
function diagnoseInitData(initData, botToken, { maxAgeSec = 86400 } = {}) {
  const out = { reason: 'unknown', fields: [], hash_ok: false, auth_date_ok: false, user_ok: false };
  if (!initData) { out.reason = 'no_initData'; return out; }
  const params = new URLSearchParams(initData);
  out.fields = Array.from(params.keys());

  const hash = params.get('hash');
  if (!hash) { out.reason = 'no_hash_field'; return out; }

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(buildDataCheckString(initData))
    .digest('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  out.hash_ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  out.auth_date_ok = !!authDate && Math.floor(Date.now() / 1000) - authDate <= maxAgeSec;

  let user = null;
  const userStr = params.get('user');
  if (userStr) { try { user = JSON.parse(userStr); out.user_ok = !!user; } catch { /* ignore */ } }

  if (!out.hash_ok) out.reason = 'bad_hash(token_mismatch)';
  else if (!out.auth_date_ok) out.reason = 'stale_auth_date';
  else if (!out.user_ok) out.reason = 'no_user';
  else out.reason = 'ok';
  return out;
}

module.exports = { buildDataCheckString, verifyInitData, diagnoseInitData };
