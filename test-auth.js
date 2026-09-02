// Quick self-test for Telegram initData verification.
// Run: node test-auth.js
// Builds a signed initData exactly like Telegram, verifies it, and checks tamper detection.

const crypto = require('crypto');
const { verifyInitData } = require('./auth');

const BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

function signInitData(initData, botToken) {
  const checkString = initData
    .split('&')
    .map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  return `${initData}&hash=${hash}`;
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
}

const authDate = Math.floor(Date.now() / 1000);
const user = { id: 279058397, first_name: 'Vladislav', last_name: 'Kibenko', username: 'vdk', language_code: 'ru', is_premium: true };
const raw = `query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=${encodeURIComponent(JSON.stringify(user))}&auth_date=${authDate}&start_param=ref_123`;
const signed = signInitData(raw, BOT_TOKEN);

console.log('Valid signature:');
{
  const r = verifyInitData(signed, BOT_TOKEN);
  check('returns user', r && r.user && r.user.id === 279058397);
  check('parses start_param', r && r.startParam === 'ref_123');
}

console.log('Tampered data:');
{
  const tampered = signed.replace('ref_123', 'ref_999');
  check('rejects tampered start_param', verifyInitData(tampered, BOT_TOKEN) === null);
}

console.log('Wrong bot token:');
{
  check('rejects wrong token', verifyInitData(signed, '999:OTHER') === null);
}

console.log('Missing hash:');
{
  check('rejects missing hash', verifyInitData(raw, BOT_TOKEN) === null);
}

console.log('Expired auth_date:');
{
  const old = `user=${encodeURIComponent(JSON.stringify(user))}&auth_date=1600000000`;
  const oldSigned = signInitData(old, BOT_TOKEN);
  check('rejects expired auth', verifyInitData(oldSigned, BOT_TOKEN) === null);
}

console.log('Reordered params (should still verify — sorting):');
{
  const shuffled = `start_param=ref_123&auth_date=${authDate}&user=${encodeURIComponent(JSON.stringify(user))}&query_id=AAHdF6IQAAAAAN0XohDhrOrc`;
  const shuffledSigned = signInitData(shuffled, BOT_TOKEN);
  check('accepts reordered params', !!verifyInitData(shuffledSigned, BOT_TOKEN));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
