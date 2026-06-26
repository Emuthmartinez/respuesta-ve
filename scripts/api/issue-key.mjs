// Generate a partner API key. Prints the plaintext ONCE and the SQL to register
// its hash (run as a coordinator / admin). The plaintext is never stored.
// Usage: node scripts/api/issue-key.mjs "<name>" [--scopes a,b] [--per-min N] [--per-day N]
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
if (!name) { console.error('usage: issue-key.mjs "<partner name>" [--scopes score,match,search,ingest] [--per-min 60] [--per-day 5000]'); process.exit(1); }
const opt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };

const scopes = opt('--scopes', 'score,match,search').split(',').map((s) => s.trim()).filter(Boolean);
const perMin = Number(opt('--per-min', '60'));
const perDay = Number(opt('--per-day', '5000'));

const key = `rvk_${crypto.randomBytes(24).toString('hex')}`;          // 48 hex chars
const hash = crypto.createHash('sha256').update(key).digest('hex');
const prefix = key.slice(0, 12);
const esc = (s) => String(s).replace(/'/g, "''");
const sql =
  `insert into public.partner_api_keys (name, key_hash, key_prefix, scopes, rate_limit_per_min, rate_limit_per_day)\n` +
  `values ('${esc(name)}', '${hash}', '${prefix}', '{${scopes.join(',')}}', ${perMin}, ${perDay});`;

console.log('\n=== API KEY (shown ONCE — store it securely) ===');
console.log(key);
console.log('\n=== Register the hash (run as admin / coordinator) ===');
console.log(sql);
console.log('\nKey prefix (for later identification):', prefix);
console.log('Scopes:', scopes.join(', '), '| limits:', `${perMin}/min`, `${perDay}/day`);
