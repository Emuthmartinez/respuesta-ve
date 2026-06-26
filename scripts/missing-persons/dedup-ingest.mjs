// Offline dedup + federated ingest of a harvested missing-person registry.
// Loads the raw harvest + photo hashes, maps to our schema, runs the
// multi-signal entity-resolution engine (lib/missing-persons.ts) with blocking,
// builds union-find clusters, and ingests via the submit_missing_person_record
// RPC — clusters concurrently, members sequentially so edges reference already-
// inserted neighbours. Phones dropped, photos hashed-not-hosted, link-back kept.
//
// Usage: node scripts/missing-persons/dedup-ingest.mjs [--ingest]
//   DATA_DIR (default ./data) holds personas.jsonl + photohash.jsonl.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nameBlockKey, blockKeys, detectMultiPerson, normalizeCedula,
  scoreRecords, clusterByDuplicateEdges,
} from '../../lib/missing-persons.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const INGEST = process.argv.includes('--ingest');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// free-text ubicacion → estado (the quake zone)
const ESTADO_KEYS = [
  ['La Guaira', /la guaira|vargas|catia la mar|maiquet|caraballeda|naiguat|tanaguaren|los corales|carayaca|macuto|caruao|chichiriviche de la costa|las salinas|pariata|camur|montesano/i],
  ['Distrito Capital', /caracas|distrito capital|petare|catia\b|el valle|antimano|la pastora|libertador/i],
  ['Miranda', /miranda|guarenas|guatire|los teques|charallave|cua\b|santa teresa|barlovento|higuerote/i],
  ['Yaracuy', /yaracuy|san felipe|yumare|nirgua|chivacoa|guama\b/i],
  ['Carabobo', /carabobo|valencia|puerto cabello|guacara|moron\b|naguanagua/i],
  ['Aragua', /aragua|maracay|la victoria|cagua|turmero|el limon|choron/i],
  ['Lara', /\blara\b|barquisimeto|carora|el tocuyo/i],
];
// Strip a cédula/phone a family typed into the name or location free-text. The
// cédula is extracted first (→ cedulaNorm); we never display the raw number.
function scrubPII(text) {
  if (!text) return text;
  return text
    .replace(/\b(?:c\.?\s?i\.?|c[eé]dula|ci)\s*:?\s*[VvEe]?[-.\s]?\d[\d.\s]{5,9}/gi, ' ')
    .replace(/\b[VvEe][-.\s]?\d{6,8}\b/g, ' ')
    .replace(/\b\d{6,9}\b/g, ' ')
    .replace(/\s{2,}/g, ' ').replace(/[,\s]+$/, '').trim();
}
function cleanName(name) {
  const c = scrubPII(name);
  return c || null;
}
function parseLocation(ubic) {
  if (!ubic) return { estado: null, municipio: null };
  const u = ubic.trim();
  let estado = null;
  for (const [name, re] of ESTADO_KEYS) if (re.test(u)) { estado = name; break; }
  // a "location" that is just a cédula/chat-paste is not a location
  if (/^\s*[VvEe]?\s*-?\s*\d{6,9}\s*$/.test(u) || /\[\d{1,2}[:/]/.test(u)) return { estado, municipio: null };
  return { estado, municipio: scrubPII(u).slice(0, 80) || null };
}
function sanitize(text) {
  if (!text) return null;
  const t = text
    .replace(/(\+?58[\s-]?)?0?4\d{2}[\s.-]?\d{3}[\s.-]?\d{2,4}/g, '[contacto omitido]')
    .replace(/\b\d{10,}\b/g, '[contacto omitido]')
    .trim();
  return t || null;
}
// extract a cédula a family embedded in the text → "Identificados" tier (digits server-only)
function extractCedula(text) {
  if (!text) return null;
  let m = text.match(/\b([VvEe])[-\s.]?(\d{6,8})\b/);
  if (m) return normalizeCedula(m[1] + m[2]);
  m = text.match(/\b(?:c[eé]dula|c\.?\s?i\.?)\s*(?:es|:)?\s*([VvEe]?)[-\s.]?(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}|\d{6,8})\b/i);
  if (m) return normalizeCedula((m[1] || '') + m[2].replace(/[.\s]/g, ''));
  return null;
}
const mapStatus = (estado) => (estado === 'localizado' ? 'found_safe' : 'missing');

// ── load + map ──
const raw = fs.readFileSync(path.join(DIR, 'personas.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const phashMap = new Map();
const phPath = path.join(DIR, 'photohash.jsonl');
if (fs.existsSync(phPath)) for (const l of fs.readFileSync(phPath, 'utf8').split('\n')) { if (l.trim()) { const j = JSON.parse(l); phashMap.set(j.id, j.phash); } }

const recs = raw.map((r) => {
  const { estado, municipio } = parseLocation(r.ubicacion);
  const name = (r.nombre || '').trim();
  const cedulaNorm = extractCedula(`${name} ${r.descripcion || ''}`);
  const display = cleanName(name); // cédula/phone scrubbed (extracted above)
  return {
    localId: crypto.randomUUID(), origId: r.id,
    displayName: display, age: Number.isFinite(r.edad) ? r.edad : null,
    estado, municipio, status: mapStatus(r.estado), notes: sanitize(r.descripcion),
    lastSeenAt: r.fecha || null, cedula: cedulaNorm, cedulaNorm,
    photoPhash: phashMap.get(r.id) || null, isMultiPerson: detectMultiPerson(name),
    namePhonetic: nameBlockKey(display || name),
  };
});

// ── blocking + scoring → edges ──
const buckets = new Map();
recs.forEach((r, i) => { for (const k of blockKeys(r)) (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i); });
const edges = new Map(recs.map((r) => [r.localId, new Set()]));
const reasonOf = new Map(recs.map((r) => [r.localId, new Set()]));
const seenPair = new Set();
let comparisons = 0, edgeCount = 0;
for (const idxs of buckets.values()) {
  if (idxs.length < 2 || idxs.length > 4000) continue;
  for (let i = 0; i < idxs.length; i++) for (let j = i + 1; j < idxs.length; j++) {
    const a = recs[idxs[i]], b = recs[idxs[j]];
    const pk = a.localId < b.localId ? a.localId + b.localId : b.localId + a.localId;
    if (seenPair.has(pk)) continue; seenPair.add(pk); comparisons++;
    const r = scoreRecords(a, b);
    if (r.related && r.confidence !== 'review') {
      edges.get(a.localId).add(b.localId); edges.get(b.localId).add(a.localId);
      r.reason.forEach((x) => { reasonOf.get(a.localId).add(x); reasonOf.get(b.localId).add(x); });
      edgeCount++;
    }
  }
}
const forCluster = recs.map((r) => ({ id: r.localId, possible_duplicate_ids: [...edges.get(r.localId)] }));
const clusters = clusterByDuplicateEdges(forCluster);
const recById = new Map(recs.map((r) => [r.localId, r]));
const multi = clusters.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);

console.log('═══ DEDUP RESULTS ═══');
console.log('raw records   :', recs.length);
console.log('comparisons   :', comparisons, `(vs ${((recs.length * (recs.length - 1)) / 2).toLocaleString()} all-pairs)`);
console.log('edges         :', edgeCount);
console.log('distinct people:', clusters.length, `(${recs.length - clusters.length} duplicates collapsed)`);
console.log('multi-clusters:', multi.length);
for (const c of multi.slice(0, 10)) console.log(`  [${c.length}] ${c.map((x) => recById.get(x.id).displayName).join(' | ')}`);

if (!INGEST) { console.log('\n(dry-run — pass --ingest to write)'); process.exit(0); }
if (!SUPABASE_URL || !ANON) { console.error('missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'); process.exit(1); }

// ── ingest (clusters concurrent, members sequential) ──
const SOURCE = 'desaparecidosterremotovenezuela';
const EXTERNAL_URL = 'https://desaparecidosterremotovenezuela.com';
const dbId = new Map();
let inserted = 0, failed = 0;
async function rpc(rec, neighborDbIds) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_missing_person_record`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      // secret token bypasses the RPC's 500/hr throttle for this trusted bulk run
      p_ip_hash: env.FEDERATION_BYPASS_TOKEN || 'desap-bulk-ingest', p_external_record_id: `desap:${rec.origId}`,
      p_source: SOURCE, p_external_url: EXTERNAL_URL, p_display_name: rec.displayName,
      p_last_seen_at: null, p_estado: rec.estado, p_municipio: rec.municipio, p_age_estimate: rec.age,
      p_cedula: rec.cedula, p_status: rec.status, p_notes: rec.notes,
      p_source_updated_at: rec.lastSeenAt ? `${rec.lastSeenAt}T00:00:00Z` : null,
      p_possible_duplicate_ids: neighborDbIds.length ? neighborDbIds : null, p_dedupe_score: null,
      p_cedula_normalized: rec.cedulaNorm, p_photo_phash: rec.photoPhash,
      p_name_phonetic: rec.namePhonetic || null, p_is_multi_person: rec.isMultiPerson,
      p_cluster_reason: [...reasonOf.get(rec.localId)],
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(JSON.stringify(j) || res.status);
  return j.id;
}
async function ingestCluster(cluster) {
  for (const rec of cluster.map((c) => recById.get(c.id))) {
    const neighbors = [...edges.get(rec.localId)].map((nl) => dbId.get(nl)).filter(Boolean);
    try { dbId.set(rec.localId, await rpc(rec, neighbors)); inserted++; }
    catch (e) { failed++; if (failed <= 5) process.stderr.write(`fail ${rec.origId}: ${e.message}\n`); }
  }
}
let ci = 0;
const worker = async () => { while (ci < clusters.length) { await ingestCluster(clusters[ci++]); if (inserted % 500 < 16) process.stderr.write(`inserted=${inserted} failed=${failed}\n`); } };
await Promise.all(Array.from({ length: 16 }, worker));
console.log(`\nINGEST DONE inserted=${inserted} failed=${failed}`);
process.exit(0);
