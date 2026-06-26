// Respectful, resumable harvester for desaparecidosterremotovenezuela.com.
// Drives the real site (reCAPTCHA v3 minted in-page) and pages through /api/personas.
// Writes one JSON line per record to OUT (resumable: skips ids already written).
// Usage: node harvest.mjs <startPage> <endPage> <outFile> [delayMs]
const BASE = 'http://127.0.0.1:9222';
const SITE = 'https://desaparecidosterremotovenezuela.com';
const API = 'https://desaparecidos-terremoto-api.theempire.tech/api/personas';
const SITEKEY = '6LeBfDUtAAAAAMw1Wtkd58bst6vEnLOi3_NAjGD0';
import fs from 'node:fs';

const startPage = Number(process.argv[2] || 1);
const endPage = Number(process.argv[3] || 2850);
const OUT = process.argv[4] || 'personas.jsonl';
const DELAY = Number(process.argv[5] || 700);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// resume: collect already-written ids
const seen = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { seen.add(JSON.parse(line).id); } catch {}
  }
}
const out = fs.createWriteStream(OUT, { flags: 'a' });

async function pageTarget() {
  const list = await (await fetch(`${BASE}/json`)).json();
  return list.find((x) => x.type === 'page') || (await (await fetch(`${BASE}/json/new?about:blank`)).json());
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); const pending = new Map(); let id = 0;
  const ready = new Promise((res) => (ws.onopen = () => res()));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send };
}
async function evalAsync(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.result?.value;
}

const t = await pageTarget();
const cdp = connect(t.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Page.navigate', { url: SITE });
for (let i = 0; i < 60; i++) { await sleep(500); if (await evalAsync(cdp, `!!(window.grecaptcha&&window.grecaptcha.execute)`)) break; }

async function fetchPage(page) {
  // mint a fresh token per request (v3 tokens are short-lived & single-use-ish)
  const raw = await evalAsync(cdp, `(async()=>{try{
    await new Promise(r=>window.grecaptcha.ready(r));
    const tk=await window.grecaptcha.execute(${JSON.stringify(SITEKEY)},{action:'list_people'});
    const r=await fetch(${JSON.stringify(API)}+'?page='+${page},{headers:{'Accept':'application/json','x-recaptcha-token':tk}});
    return JSON.stringify({status:r.status, body: await r.text()});
  }catch(e){return JSON.stringify({error:String(e)})}})()`);
  return JSON.parse(raw);
}

let written = 0, fetched = 0, errors = 0;
for (let p = startPage; p <= endPage; p++) {
  let res;
  try { res = await fetchPage(p); } catch (e) { res = { error: String(e) }; }
  if (res.error || res.status !== 200) {
    errors++;
    process.stderr.write(`page ${p}: ERR ${res.error || res.status}\n`);
    if (errors > 30) { process.stderr.write('too many errors, stopping\n'); break; }
    await sleep(DELAY * 3);
    p--; // retry same page
    continue;
  }
  errors = 0;
  let j; try { j = JSON.parse(res.body); } catch { j = null; }
  const items = j?.items || [];
  if (items.length === 0) { process.stderr.write(`page ${p}: empty, stopping\n`); break; }
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.write(JSON.stringify(it) + '\n');
    written++;
  }
  fetched++;
  if (p % 25 === 0 || p === startPage) process.stderr.write(`page ${p}/${endPage} total=${j?.total} written=${written}\n`);
  await sleep(DELAY);
}
out.end();
process.stderr.write(`DONE pages_fetched=${fetched} records_written=${written}\n`);
process.exit(0);
