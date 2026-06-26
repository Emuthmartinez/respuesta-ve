// Missing-person fuzzy dedup — SURFACE, NEVER AUTO-MERGE.
//
// During a disaster the same person is often posted to several registries
// with name spelling variants, an approximate age, and a rough locality. We
// compute a similarity score to SUGGEST "posible misma persona" so families
// (and coordinators) see one consolidated cluster instead of N scattered hits.
//
// Critically, this only ever *suggests*. A wrong auto-merge can hide a found
// person, so the authoritative merge (`duplicate_of`) stays human-gated. These
// functions are pure + deterministic so they're unit-testable offline.

export interface MatchableRecord {
  id?: string;
  displayName: string | null;
  age: number | null;
  estado: string | null;
  municipio: string | null;
}

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

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'da', 'do', 'di', 'van', 'von']);

const tokenSet = (s: string): Set<string> => new Set(s.split(' ').filter(Boolean));

/** Jaccard overlap of name tokens (order-independent): |A∩B| / |A∪B|. */
function nameTokenSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const norm = (s: string | null): string => (s ? normalizeName(s) : '');

/**
 * Similarity in [0,1] that two records are the same person. Name is the spine;
 * age and locality nudge it. Conservative by design — we'd rather miss a dup
 * (two hits shown) than assert a false one.
 */
export function matchScore(a: MatchableRecord, b: MatchableRecord): number {
  const nameSim = nameTokenSimilarity(norm(a.displayName), norm(b.displayName));
  if (nameSim === 0) return 0; // no shared name token → never a suggestion

  let score = nameSim;

  // Age agreement (only when both known): close ages corroborate, far ages veto.
  if (a.age != null && b.age != null) {
    const gap = Math.abs(a.age - b.age);
    if (gap <= 2) score += 0.15;
    else if (gap >= 10) score -= 0.25;
  }

  // Locality agreement (only when both known).
  if (a.estado && b.estado) {
    if (norm(a.estado) === norm(b.estado)) {
      score += 0.1;
      if (a.municipio && b.municipio && norm(a.municipio) === norm(b.municipio)) score += 0.05;
    } else {
      score -= 0.1; // different state weakens, doesn't kill (people move/flee)
    }
  }

  return Math.max(0, Math.min(1, score));
}

export const DEDUP_THRESHOLD = 0.62;

export interface DuplicateSuggestion {
  id: string;
  score: number;
}

/**
 * Among `candidates`, the ones that might be the same person as `record`,
 * scored and sorted desc. Caller stores these as ADVISORY annotations only.
 */
export function findPossibleDuplicates(
  record: MatchableRecord,
  candidates: MatchableRecord[],
  threshold: number = DEDUP_THRESHOLD,
): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  for (const c of candidates) {
    if (!c.id || c.id === record.id) continue;
    const score = matchScore(record, c);
    if (score >= threshold) out.push({ id: c.id, score: Number(score.toFixed(3)) });
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * Group records into "posible misma persona" clusters from precomputed
 * possible_duplicate_ids edges (union-find). Used by the public search to
 * collapse scattered hits into one card. Records never linked stay singletons.
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
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

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
