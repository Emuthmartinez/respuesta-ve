// Missing-person entity resolution — SURFACE & CLUSTER, NEVER LOSE A RECORD.
//
// During a disaster the SAME person is reported many times across registries:
// name-spelling variants ("Guillermo Leon" / "Guillermo León Blanco"), an
// approximate age, a rough locality, sometimes the same photo, sometimes a
// cédula (Venezuelan national ID — a strong unique key) and often not. The
// source registries scatter these into dozens of hits per person.
//
// We resolve them with a MULTI-SIGNAL cascade (cédula → photo → name+age+
// locality) and group with union-find. Two rules, from the life-safety
// asymmetry that governs every threshold here:
//   • Grouping RECALL is generous   — showing two copies that *might* be one
//     person, together in one card, never hides anyone (the family sees both).
//   • Merge/suppress PRECISION is conservative — collapsing two records into
//     one, hiding one, or propagating a "found" status across a wrong cluster
//     can STOP a search for someone still trapped. So the only destructive
//     merge (`duplicate_of`) stays coordinator-gated and reversible, and a
//     cluster's shown status is always its most-urgent member's.
//
// Design reviewed by a 5-lens council + 2 red-team passes (see the session
// spec). Every function is pure + deterministic → unit-tested offline in
// lib/missing-persons.test.mjs. The scoring/clustering runs in the Cloudflare
// Worker (cheap, no image decode); photo hashing runs only in the local ingest
// routine (ImageMagick). Dependency-free by project convention.

import type { MissingStatus } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'di', 'van', 'von']);

/** Lowercase, strip accents/punctuation, drop name particles, collapse space. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_PARTICLES.has(t))
    .join(' ')
    .trim();
}

const norm = (s: string | null | undefined): string => (s ? normalizeName(s) : '');
const tokenize = (s: string): string[] => s.split(' ').filter(Boolean);

/**
 * Fold a normalized Spanish name token to a phonetic key so spelling variants
 * collapse: Yorman/Jorman, García/Garzia, Jiménez/Ximenez, Blanco/Vlanco,
 * Beltrán/Beltran. A small, dependency-free Spanish-phonetic folding (not full
 * double-metaphone, but tuned to the variants that actually recur in the feed).
 */
export function spanishPhonetic(token: string): string {
  let t = token;
  t = t.replace(/h/g, '');                 // silent h (hernandez→ernandez)
  t = t.replace(/v/g, 'b');                // b/v merge (blanco/vlanco)
  t = t.replace(/z/g, 's');                // seseo (z→s)
  t = t.replace(/x/g, 's');                // ximenez→simenes
  t = t.replace(/ce/g, 'se').replace(/ci/g, 'si'); // soft c → s
  t = t.replace(/qu/g, 'k').replace(/c/g, 'k');    // hard c / qu → k
  t = t.replace(/gue/g, 'ge').replace(/gui/g, 'gi'); // silent u in gue/gui
  t = t.replace(/ge/g, 'xe').replace(/gi/g, 'xi');   // soft g → x (j sound)
  t = t.replace(/j/g, 'x');                // j → x (jorman/yorman handled below)
  t = t.replace(/ll/g, 'y');               // ll/y merge
  t = t.replace(/w/g, 'b');
  t = t.replace(/(.)\1+/g, '$1');          // collapse doubled letters
  t = t.replace(/s$/, '');                 // drop trailing plural-ish s
  return t || token;
}

const tokenSet = (s: string): Set<string> => new Set(tokenize(s));

/**
 * Normalize a Venezuelan cédula for exact-match comparison.
 * CRITICAL (council fix): the V (citizen) and E (foreign national) prefixes are
 * SEMANTICALLY DISTINCT — V8765432 and E8765432 are definitively different
 * people and must never merge. Strip only punctuation/space, NEVER the prefix.
 *   'V-8.765.432' → 'V8765432'   'e8765432' → 'E8765432'   '8765432' → '8765432'
 * Returns null for anything that isn't a plausible cédula.
 */
export function normalizeCedula(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/[\s.\-]/g, '');
  if (/^[VE]\d{6,8}$/.test(s)) return s;
  if (/^\d{6,8}$/.test(s)) return s; // prefix-less — kept, treated as ambiguous
  return null;
}

/** Mask a cédula for (coordinator-only) display: prefix + last 2 digits. */
export function maskCedula(raw: string | null | undefined): string | null {
  const d = normalizeCedula(raw);
  if (!d) return null;
  const hasPrefix = /^[VE]/.test(d);
  const prefix = hasPrefix ? d[0] : 'V';
  return `${prefix}-••••••${d.slice(-2)}`;
}

/**
 * Detect a report naming MORE THAN ONE person ("José Pérez, Alicia Magallanes
 * y Mathias Medina"). ~14% of real reports do this. Such a record must NEVER be
 * matched as a single identity — we flag it and keep it whole, shown as a group
 * report rather than folded into one person's cluster.
 */
export function detectMultiPerson(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/\([^)]*\)/g, ' '); // drop "(Padre)" / "(Menor)" etc.
  const chunks = cleaned
    .split(/\s*,\s*|\s+y\s+|\s+e\s+|\s*&\s*|\s*\/\s*|\s*;\s*/i)
    .map((c) => c.trim())
    .filter((c) => /[a-záéíóúñ]/i.test(c) && normalizeName(c).split(' ').filter(Boolean).length >= 1);
  return chunks.length >= 2;
}

// ─────────────────────────────────────────────────────────────────────────
// Blocking (keeps matching ~O(n) at 57k scale)
// ─────────────────────────────────────────────────────────────────────────

/** Phonetic blocking key: phonetic-folded first + last name token. */
export function nameBlockKey(name: string | null | undefined): string {
  const toks = tokenize(norm(name)).map(spanishPhonetic);
  if (toks.length === 0) return '';
  if (toks.length === 1) return toks[0];
  return `${toks[0]}|${toks[toks.length - 1]}`;
}

/** Every blocking key a record participates in (cédula, name, photo bucket). */
export function blockKeys(r: MatchableRecord): string[] {
  const keys: string[] = [];
  if (r.cedulaNorm) keys.push(`ced:${r.cedulaNorm}`);
  // Pair the given name with EACH other token, so "Andrés Poleo" and "Andrés
  // Eduardo Poleo Mundaraín" still meet (via andres|poleo) despite different
  // last tokens — the scorer then decides; this only widens candidate recall.
  const toks = tokenize(norm(r.displayName)).map(spanishPhonetic);
  if (toks.length === 1) keys.push(`nm:${toks[0]}`);
  else for (let i = 1; i < toks.length; i++) keys.push(`nm:${toks[0]}|${toks[i]}`);
  if (r.photoPhash && r.photoPhash.length >= 3) keys.push(`ph:${r.photoPhash.slice(0, 3)}`);
  return keys;
}

// ─────────────────────────────────────────────────────────────────────────
// Similarity primitives
// ─────────────────────────────────────────────────────────────────────────

/** Jaccard overlap of raw name tokens (order-independent): |A∩B| / |A∪B|. */
export function nameTokenSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Phonetic Jaccard over Spanish-folded name tokens (order-independent). */
export function phoneticNameSimilarity(a: string, b: string): number {
  const A = phoneticSet(a);
  const B = phoneticSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Count of shared phonetic name tokens. The fuzzy path requires ≥2 — a single
 * shared common given name ("María", "José") is NOT enough to group two people,
 * but a shared given name + surname ("Guillermo León", even spelled variously)
 * is. This gate, not a length discount, is what keeps "Guillermo Leon" matching
 * "Guillermo José León Blanco" while keeping the 50 different "Marías" apart.
 */
export function sharedPhoneticCount(a: string, b: string): number {
  const A = phoneticSet(a);
  const B = phoneticSet(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter;
}

const phoneticSet = (s: string): Set<string> => new Set(tokenize(norm(s)).map(spanishPhonetic));

// The most common Venezuelan given names + surnames, phonetic-folded. A shared
// COMMON token ("María", "Rodríguez") is weak evidence of identity — thousands
// of people share it — so a match on common tokens ALONE needs corroboration;
// a shared DISTINCTIVE token ("Poleo", "Rujano") is strong. This is IDF
// weighting reduced to a static list (so the scorer stays pure/dependency-free).
const COMMON_NAME_RAW = [
  // given names (incl. common compound second-names like "José GREGORIO",
  // "Julio CÉSAR", "María EUGENIA" — these are NOT identity-bearing surnames).
  'maria', 'jose', 'juan', 'carlos', 'luis', 'ana', 'jesus', 'pedro', 'miguel', 'rafael',
  'francisco', 'antonio', 'manuel', 'pablo', 'daniel', 'david', 'angel', 'victor', 'jorge',
  'gabriel', 'andres', 'eduardo', 'fernando', 'ricardo', 'alberto', 'alejandro', 'gregorio',
  'cesar', 'enrique', 'ramon', 'ernesto', 'javier', 'sebastian', 'santiago', 'oscar', 'hector',
  'gustavo', 'raul', 'julio', 'mario', 'ruben', 'armando', 'wilmer', 'yorman', 'yoendi',
  'leonardo', 'diego', 'adrian', 'ivan', 'omar', 'moises', 'samuel', 'felix', 'simon', 'jhon',
  'jhonny', 'richard', 'freddy', 'douglas', 'franklin', 'gregori', 'alexis', 'wilfredo',
  'adolfo', 'dario', 'alfonso', 'alfonzo', 'augusto', 'alfredo', 'ignacio', 'vicente', 'emilio',
  'fernanda', 'gabriela', 'andrea', 'valentina', 'camila', 'sofia', 'isabella', 'daniela',
  'victoria', 'carmen', 'rosa', 'elena', 'teresa', 'laura', 'eugenia', 'alejandra', 'beatriz',
  'mercedes', 'milagros', 'coromoto', 'chiquinquira', 'josefina', 'yajaira', 'oriana', 'genesis',
  'andreina', 'carolina', 'paola', 'patricia', 'veronica', 'isabel', 'cristina', 'claudia',
  'monica', 'mariangel', 'michelle', 'yelitza', 'yusmary', 'deisy', 'karina', 'nancy', 'gladys',
  'angeles', 'valle', 'del', 'los', 'jose', 'maria',
  // surnames
  'gonzalez', 'rodriguez', 'perez', 'garcia', 'martinez', 'hernandez', 'lopez', 'sanchez',
  'ramirez', 'torres', 'flores', 'rivas', 'diaz', 'silva', 'mora', 'rojas', 'gomez', 'vargas',
  'castro', 'ramos', 'romero', 'suarez', 'blanco', 'marquez', 'guerra', 'medina', 'salazar',
  'fernandez', 'gimenez', 'jimenez', 'moreno', 'reyes', 'gutierrez', 'ortiz', 'rivero',
  'aponte', 'mendoza', 'contreras', 'guevara', 'herrera', 'parra', 'rondon', 'bravo', 'leon',
  'marin', 'salas', 'navarro', 'pacheco', 'quintero', 'rangel', 'bermudez', 'mejias', 'graterol',
];
const COMMON_NAME_TOKENS = new Set(COMMON_NAME_RAW.map(spanishPhonetic));

const isCommonToken = (phoneticTok: string): boolean => COMMON_NAME_TOKENS.has(phoneticTok);

/**
 * IDF-weighted name similarity: shared COMMON tokens count for little (0.3),
 * shared DISTINCTIVE tokens count fully (1.0). "María Rodríguez" vs "María
 * Elena Rodríguez" scores low; "Andrés Poleo" vs "Andres Poleo" scores high.
 */
export function weightedNameSimilarity(a: string, b: string): number {
  const A = phoneticSet(a);
  const B = phoneticSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  const w = (t: string) => (isCommonToken(t) ? 0.3 : 1);
  let interW = 0, unionW = 0;
  const union = new Set([...A, ...B]);
  for (const t of union) { unionW += w(t); if (A.has(t) && B.has(t)) interW += w(t); }
  return unionW === 0 ? 0 : interW / unionW;
}

/** Shared phonetic tokens that are NOT common names (the distinctive overlap). */
export function distinctiveSharedCount(a: string, b: string): number {
  const A = phoneticSet(a);
  const B = phoneticSet(b);
  let n = 0;
  for (const t of A) if (B.has(t) && !isCommonToken(t)) n++;
  return n;
}

/** First (given-name) phonetic token. Two records only match if these agree —
 * a shared surname alone means family, not the same person. */
export function firstPhoneticToken(name: string): string {
  return tokenize(norm(name)).map(spanishPhonetic)[0] ?? '';
}


/** Hamming distance (0–64) between two 16-hex-char dHash fingerprints. */
export function hammingHex(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

/** Two photos are "the same image" when their dHashes are within this many bits.
 * Tight (≈recompression noise) — ID-style headshots collide easily, so a loose
 * threshold would falsely bridge different people who share a common given name. */
export const PHOTO_HAMMING_STRONG = 8;

// ─────────────────────────────────────────────────────────────────────────
// Multi-signal scoring
// ─────────────────────────────────────────────────────────────────────────

export interface MatchableRecord {
  id?: string;
  displayName: string | null;
  age: number | null;
  estado: string | null;
  municipio: string | null;
  cedulaNorm?: string | null;   // prefix-preserving normalized cédula
  photoPhash?: string | null;   // 16-hex dHash of the photo, when available
  isMultiPerson?: boolean;      // names ≥2 people → never a 1:1 identity
}

export type MatchMethod =
  | 'cedula'            // same national ID + name plausible → confirmed
  | 'cedula_conflict'  // same national ID but names clash → review (challenger)
  | 'cedula_mismatch'  // different national IDs → different people (veto)
  | 'cedula_typo'      // off-by-one cédula + strong name → review, not veto
  | 'photo'            // same photo + no name conflict → confirmed
  | 'photo_conflict'   // same photo but names clash (group photo?) → review
  | 'fuzzy'            // name+age+locality similarity → possible
  | 'multi_person'     // one side is a group report → never matched
  | 'none';

export type MatchConfidence = 'confirmed' | 'possible' | 'review' | 'none';

export interface MatchResult {
  related: boolean;
  score: number;                 // 0..1
  method: MatchMethod;
  confidence: MatchConfidence;
  /** Which signals drove a positive match — persisted as cluster_reason. */
  reason: ('cedula' | 'name' | 'photo')[];
}

/** Below this combined score we do not surface even a "possible" edge. */
export const POSSIBLE_THRESHOLD = 0.55;
/** Minimum phonetic name Jaccard for the fuzzy path (with ≥2 shared tokens). */
export const NAME_FLOOR = 0.3;
/** Same-cédula but name below this → human-review conflict, not silent confirm. */
export const CEDULA_NAME_CONFLICT = 0.25;

// Back-compat alias for callers that imported the v1 constant name.
export const DEDUP_THRESHOLD = POSSIBLE_THRESHOLD;

/**
 * Score that two records are the SAME PERSON, with method + confidence tier.
 * The cascade encodes the precision asymmetry: a strong identifier (cédula,
 * exact photo) can yield CONFIRMED; name+age+locality only ever yields POSSIBLE.
 * A group report never matches as a single identity.
 */
export function scoreRecords(a: MatchableRecord, b: MatchableRecord): MatchResult {
  const none = (method: MatchMethod = 'none'): MatchResult =>
    ({ related: false, score: 0, method, confidence: 'none', reason: [] });

  // A group report ("A, B y C") is never a single identity — keep it whole.
  if (a.isMultiPerson || b.isMultiPerson) return none('multi_person');

  const bothNamed = !!norm(a.displayName) && !!norm(b.displayName);
  const nameSim = phoneticNameSimilarity(a.displayName ?? '', b.displayName ?? '');

  // ── TIER 0: CÉDULA — deterministic, but name-cross-checked ─────────────
  if (a.cedulaNorm && b.cedulaNorm) {
    if (a.cedulaNorm === b.cedulaNorm) {
      if (bothNamed && nameSim < CEDULA_NAME_CONFLICT) {
        // Same ID, very different names → likely a transcription error. Surface
        // for a human; do NOT auto-confirm (could otherwise fuse two people).
        return { related: true, score: 0.9, method: 'cedula_conflict', confidence: 'review', reason: ['cedula'] };
      }
      return { related: true, score: 1, method: 'cedula', confidence: 'confirmed', reason: ['cedula'] };
    }
    // Different cédulas → different people. Hard veto even if name+locality
    // coincide (two cousins "José González"). Off-by-one + strong name is the
    // one exception: a possible typo → review, not veto.
    if (a.cedulaNorm[0] === b.cedulaNorm[0] && levenshtein(a.cedulaNorm, b.cedulaNorm) === 1 && nameSim >= 0.6) {
      return { related: true, score: 0.85, method: 'cedula_typo', confidence: 'review', reason: ['cedula'] };
    }
    return none('cedula_mismatch');
  }

  // ── photo pre-check (used before the age veto) ─────────────────────────
  let photoStrong = false;
  if (a.photoPhash && b.photoPhash) {
    photoStrong = hammingHex(a.photoPhash, b.photoPhash) <= PHOTO_HAMMING_STRONG;
  }

  // ── TIER 1: PHOTO — same image is a strong identity signal ─────────────
  // "Same image ⇒ same person — UNLESS two distinct people share the photo."
  // We confirm only when the GIVEN NAME also agrees; a shared photo carrying
  // different names is a GROUP photo (a family snapshot reused across each
  // member's report) → surface for review, never a silent merge.
  if (photoStrong) {
    // ID-style headshot dHashes collide between different people, so a photo
    // match alone is NOT proof of identity. It CONFIRMS only when it corroborates
    // a name — the given name agrees AND a distinctive token is shared (this still
    // rescues "Nerio" → "Nerio Arias", which name-fuzzy alone misses on 1 token).
    // Otherwise the photo is surfaced for review, never used to merge.
    const givenAgree = bothNamed && firstPhoneticToken(a.displayName ?? '') === firstPhoneticToken(b.displayName ?? '');
    const nameCorroborates = distinctiveSharedCount(a.displayName ?? '', b.displayName ?? '') > 0;
    if (givenAgree && nameCorroborates) {
      return { related: true, score: 0.95, method: 'photo', confidence: 'confirmed', reason: ['photo'] };
    }
    return { related: true, score: 0.7, method: 'photo_conflict', confidence: 'review', reason: ['photo'] };
  }

  // ── TIER 2: NAME + AGE + LOCALITY (fuzzy, advisory only) ───────────────
  const na = a.displayName ?? '', nb = b.displayName ?? '';
  const sameEstado = !!(a.estado && b.estado && norm(a.estado) === norm(b.estado));
  const sameMuni = !!(a.municipio && b.municipio && norm(a.municipio) === norm(b.municipio));
  const bothAged = a.age != null && b.age != null;
  const ageGap = bothAged ? Math.abs((a.age as number) - (b.age as number)) : null;
  const ageClose = ageGap != null && ageGap <= 3;

  // Far ages → different people (no photo corroboration reached this tier).
  if (ageGap != null && ageGap >= 8) return none('fuzzy');
  // Need given-name + surname overlap, not a lone shared token.
  if (sharedPhoneticCount(na, nb) < 2) return none('fuzzy');
  // Given names must agree: two people sharing only a surname ("Ángel Gavidia"
  // vs "Aris Gavidia") are family, NOT the same person.
  if (firstPhoneticToken(na) !== firstPhoneticToken(nb)) return none('fuzzy');
  // Common-name guard: a fuzzy merge REQUIRES at least one distinctive shared
  // token ("Poleo", "Rujano"). Sharing only common tokens — even a compound
  // given name like "José Gregorio" or a "María Rodríguez" — is not enough; that
  // path needs a photo or cédula to merge. This is what stops a common name from
  // chaining dozens of different people into one cluster.
  if (distinctiveSharedCount(na, nb) === 0) return none('fuzzy');

  let score = weightedNameSimilarity(na, nb);
  if (score < NAME_FLOOR) return none('fuzzy');
  const reason: ('cedula' | 'name' | 'photo')[] = ['name'];
  if (ageClose) score += 0.15;
  if (sameEstado) { score += 0.1; if (sameMuni) score += 0.05; }
  else if (a.estado && b.estado) score -= 0.05;

  score = Math.max(0, Math.min(1, score));
  const related = score >= POSSIBLE_THRESHOLD;
  return { related, score, method: 'fuzzy', confidence: related ? 'possible' : 'none', reason: related ? reason : [] };
}

/** v1 scalar score, retained for callers that just want the number. */
export function matchScore(a: MatchableRecord, b: MatchableRecord): number {
  return scoreRecords(a, b).score;
}

/** Bounded Levenshtein (used for near-miss cédula typo detection). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// ─────────────────────────────────────────────────────────────────────────
// Edge discovery + clustering
// ─────────────────────────────────────────────────────────────────────────

export interface DuplicateSuggestion {
  id: string;
  score: number;
  method: MatchMethod;
  confidence: MatchConfidence;
}

export interface MatchEdges {
  confirmed: DuplicateSuggestion[]; // cédula / exact photo
  possible: DuplicateSuggestion[];  // fuzzy
  review: DuplicateSuggestion[];    // conflicts → coordinator
  reason: ('cedula' | 'name' | 'photo')[];
}

/** All edges from `record` into (already-blocked) `candidates`, by confidence. */
export function findMatches(record: MatchableRecord, candidates: MatchableRecord[]): MatchEdges {
  const confirmed: DuplicateSuggestion[] = [];
  const possible: DuplicateSuggestion[] = [];
  const review: DuplicateSuggestion[] = [];
  const reason = new Set<'cedula' | 'name' | 'photo'>();
  for (const c of candidates) {
    if (!c.id || c.id === record.id) continue;
    const r = scoreRecords(record, c);
    if (!r.related) continue;
    const s: DuplicateSuggestion = { id: c.id, score: Number(r.score.toFixed(3)), method: r.method, confidence: r.confidence };
    if (r.confidence === 'confirmed') { confirmed.push(s); r.reason.forEach((x) => reason.add(x)); }
    else if (r.confidence === 'review') review.push(s);
    else { possible.push(s); r.reason.forEach((x) => reason.add(x)); }
  }
  const byScore = (x: DuplicateSuggestion, y: DuplicateSuggestion) => y.score - x.score;
  return {
    confirmed: confirmed.sort(byScore),
    possible: possible.sort(byScore),
    review: review.sort(byScore),
    reason: [...reason],
  };
}

/**
 * v1 advisory API (returns edges ≥ threshold, sorted). Retained for the ingest
 * route. Excludes group reports and honors all vetoes via scoreRecords.
 */
export function findPossibleDuplicates(
  record: MatchableRecord,
  candidates: MatchableRecord[],
  threshold: number = POSSIBLE_THRESHOLD,
): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  for (const c of candidates) {
    if (!c.id || c.id === record.id) continue;
    const r = scoreRecords(record, c);
    // Confirmed (cédula/photo) edges have score ≥ threshold by construction;
    // fuzzy edges are gated by `related`.
    if (r.related && r.confidence !== 'review' && r.score >= threshold) {
      out.push({ id: c.id, score: Number(r.score.toFixed(3)), method: r.method, confidence: r.confidence });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * Group records into clusters from precomputed possible_duplicate_ids edges
 * (union-find). One-directional edges still group (a "B→A" edge unites {A,B}).
 * Records never linked stay singletons → nothing is ever lost.
 */
export function clusterByDuplicateEdges<T extends { id: string; possible_duplicate_ids?: string[] | null }>(
  records: T[],
): T[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  const byId = new Map(records.map((r) => [r.id, r]));
  for (const r of records) parent.set(r.id, r.id);
  for (const r of records) {
    for (const other of r.possible_duplicate_ids ?? []) {
      if (byId.has(other)) union(r.id, other);
    }
  }

  const groups = new Map<string, T[]>();
  for (const r of records) {
    const root = find(r.id);
    const g = groups.get(root) ?? [];
    g.push(r);
    groups.set(root, g);
  }
  return [...groups.values()];
}

// ─────────────────────────────────────────────────────────────────────────
// Presentation tier + cluster status (life-safety aware)
// ─────────────────────────────────────────────────────────────────────────

/** A record is IDENTIFIED if it carries a (non-conflicting) cédula. */
export function identificationTier(
  r: { cedula_confirmed?: boolean | null; cedulaNorm?: string | null },
): 'identified' | 'approximate' {
  return r.cedula_confirmed || r.cedulaNorm ? 'identified' : 'approximate';
}

/**
 * Status-urgency order. LIFE-SAFETY RULE: a cluster is shown at its MOST-URGENT
 * member's status — a "found safe" copy from one source must NEVER suppress an
 * unresolved report. `missing` outranks everything; `deceased` ranks lowest so
 * it never overrides a still-hopeful status.
 */
export const STATUS_URGENCY: Record<MissingStatus, number> = {
  missing: 5,
  found_injured: 4,
  unknown: 3,
  found_safe: 2,
  deceased: 1,
};

export function clusterDisplayStatus(statuses: MissingStatus[]): MissingStatus {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((worst, s) => (STATUS_URGENCY[s] > STATUS_URGENCY[worst] ? s : worst), statuses[0]);
}

/** True when a cluster mixes a still-open status with a resolved one → callout. */
export function clusterHasStatusConflict(statuses: MissingStatus[]): boolean {
  const open = statuses.some((s) => s === 'missing' || s === 'unknown');
  const resolved = statuses.some((s) => s === 'found_safe' || s === 'found_injured' || s === 'deceased');
  return open && resolved;
}
