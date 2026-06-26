// Parallel perceptual-hash (dHash) of public S3 photos. curl→ImageMagick→64-bit
// fingerprint. Stores ONLY the hash (never the image). Resumable.
// Usage: node phash.mjs personas.jsonl photohash.jsonl [concurrency]
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const IN = process.argv[2] || 'personas.jsonl';
const OUT = process.argv[3] || 'photohash.jsonl';
const CONC = Number(process.argv[4] || 10);
import os from "node:os";
const TMP = fs.mkdtempSync(os.tmpdir() + "/ph-");
fs.mkdirSync(TMP, { recursive: true });

const done = new Set();
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) { if (l.trim()) try { done.add(JSON.parse(l).id); } catch {} }
const out = fs.createWriteStream(OUT, { flags: 'a' });

const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((r) => r.foto && /^https?:\/\//.test(r.foto) && !done.has(r.id));

function dhashFromGray(buf) {
  const W = 9, H = 8; let bits = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += buf[y * W + x] > buf[y * W + x + 1] ? '1' : '0';
  let hex = ''; for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

async function hashOne(r, i) {
  const f = `${TMP}/${i}.img`;
  try {
    await exec('curl', ['-sL', '--max-time', '20', '-o', f, r.foto]);
    const { stdout } = await exec('magick', [f, '-resize', '9x8!', '-colorspace', 'Gray', '-depth', '8', 'gray:-'], { encoding: 'buffer', maxBuffer: 1 << 20 });
    fs.rmSync(f, { force: true });
    if (stdout.length < 72) return null;
    return { id: r.id, phash: dhashFromGray(stdout) };
  } catch { fs.rmSync(f, { force: true }); return null; }
}

let idx = 0, ok = 0, fail = 0;
async function worker(wid) {
  while (idx < rows.length) {
    const my = idx++;
    const res = await hashOne(rows[my], `${wid}_${my}`);
    if (res) { out.write(JSON.stringify(res) + '\n'); ok++; } else fail++;
    if ((ok + fail) % 250 === 0) process.stderr.write(`hashed=${ok} fail=${fail} of ${rows.length}\n`);
  }
}
await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));
out.end();
process.stderr.write(`DONE hashed=${ok} fail=${fail} (skipped ${done.size} already done)\n`);
process.exit(0);
