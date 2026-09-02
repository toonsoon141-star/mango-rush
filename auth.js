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

module.exports = { buildDataCheckString, verifyInitData };
