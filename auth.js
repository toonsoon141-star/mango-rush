// ============================================================
//  Telegram Mini App initData verification (HMAC-SHA256)
// ============================================================

const crypto = require('crypto');

/**
 * Builds the data-check-string from RAW initData.
 *
 * Telegram client versions differ in how they compute the `hash`:
 *   - some use the raw (URL-encoded) field values,
 *   - some use the decoded field values,
 *   - some include the `signature` field in the data-check-string,
 *   - some exclude it.
 *
 * To be compatible with every client we try all four combinations.
 * Empirically verified (2026-09-02): the current client uses
 * DECODED values and INCLUDES the signature field.
 */
function buildDataCheckString(initData, { excludeSignature = false, decode = false } = {}) {
  const pairs = [];
  for (const pair of initData.split('&')) {
    if (!pair.length) continue;
    const idx = pair.indexOf('=');
    const key = pair.slice(0, idx);
    let value = idx === -1 ? '' : pair.slice(idx + 1);
    if (key === 'hash') continue;               // hash is never part of the string
    if (excludeSignature && key === 'signature') continue;
    if (decode) {
      try { value = decodeURIComponent(value); } catch (e) { /* keep raw on bad input */ }
    }
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return pairs.map(([key, value]) => `${key}=${value}`).join('\n');
}

function computeHash(initData, botToken, opts) {
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  return crypto
    .createHmac('sha256', secretKey)
    .update(buildDataCheckString(initData, opts))
    .digest('hex');
}

function hexEquals(aHex, bHex) {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

// All accepted hash schemes (client-version compatible).
const SCHEMES = [
  { excludeSignature: false, decode: false }, // raw,     include signature
  { excludeSignature: true,  decode: false }, // raw,     exclude signature
  { excludeSignature: false, decode: true  }, // decoded, include signature
  { excludeSignature: true,  decode: true  }, // decoded, exclude signature
];

function hashMatches(initData, botToken) {
  return SCHEMES.some((s) => hexEquals(computeHash(initData, botToken, s), (initData.match(/(?:^|&)hash=([^&]*)/) || [])[1] || ''));
}

function verifyInitData(initData, botToken, { maxAgeSec = 86400 } = {}) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  if (!hashMatches(initData, botToken)) return null;

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
 * Returns { reason, fields, hash_ok, auth_date_ok, user_ok, has_signature, matched_scheme }.
 */
function diagnoseInitData(initData, botToken, { maxAgeSec = 86400 } = {}) {
  const out = { reason: 'unknown', fields: [], hash_ok: false, auth_date_ok: false, user_ok: false, has_signature: false, matched_scheme: null };
  if (!initData) { out.reason = 'no_initData'; return out; }
  const params = new URLSearchParams(initData);
  out.fields = Array.from(params.keys());
  out.has_signature = out.fields.includes('signature');

  const hash = params.get('hash');
  if (!hash) { out.reason = 'no_hash_field'; return out; }

  const schemeNames = ['raw+signature', 'raw-sig', 'decoded+signature', 'decoded-sig'];
  SCHEMES.forEach((s, i) => {
    if (hexEquals(computeHash(initData, botToken, s), hash)) {
      out.hash_ok = true;
      out.matched_scheme = schemeNames[i];
    }
  });

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

module.exports = { buildDataCheckString, verifyInitData, diagnoseInitData, computeHash };
