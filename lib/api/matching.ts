// Matching service — the shared brain behind /score and /match.
//
// /score is PURE: it runs the full engine (cédula + photo + fuzzy) on two
// partner-supplied records, no database. /match runs the engine against the
// LIVE federated index. Because the Worker reads the public view (which omits
// cédula digits and photo hashes by design), index matching uses the
// name+age+locality signal — safe, with no PII flowing in or out. Cédula/photo
// power is available in /score on data the partner already holds.

import type { SupabaseClient } from '@supabase/supabase-js';
import { scoreRecords, normalizeName, type MatchableRecord } from '@/lib/missing-persons';
import { redact, type MatchOut, type PublicRow } from '@/lib/api/redact';

export const PUBLIC_SELECT =
  'id, display_name, estado, municipio, status, source, external_url, age_estimate, cedula_confirmed, cluster_id, cluster_size, is_multi_person, last_seen_at, source_updated_at, updated_at';

/** Pure one-to-many scoring (no DB). Returns related candidates, ranked. */
export function scoreAgainst(
  record: MatchableRecord,
  candidates: MatchableRecord[],
): { index: number; score: number; method: string; confidence: string }[] {
  const out: { index: number; score: number; method: string; confidence: string }[] = [];
  candidates.forEach((c, index) => {
    const r = scoreRecords(record, c);
    if (r.related) out.push({ index, score: Number(r.score.toFixed(3)), method: r.method, confidence: r.confidence });
  });
  return out.sort((a, b) => b.score - a.score);
}

const candidateToMatchable = (row: PublicRow): MatchableRecord => ({
  id: row.id,
  displayName: row.display_name,
  age: row.age_estimate,
  estado: row.estado,
  municipio: row.municipio,
  cedulaNorm: null,      // not exposed by the public view
  photoPhash: null,      // not exposed by the public view
  isMultiPerson: row.is_multi_person,
});

/**
 * Match a record against the live federated index. Blocks by name token via the
 * trigram index, scores each candidate with the engine, returns ranked redacted
 * matches. Self-excludes a record that shares the input's external_url is N/A
 * here (read-only). Never returns cédula digits, contact, or photo data.
 */
export async function matchAgainstIndex(
  sb: SupabaseClient,
  record: MatchableRecord,
  limit: number,
): Promise<MatchOut[]> {
  const tokens = normalizeName(record.displayName).split(' ').filter((t) => t.length >= 3).slice(0, 4);
  if (tokens.length === 0) return [];

  // OR of ILIKE per distinctive token (uses the gin_trgm index).
  const orFilter = tokens.map((t) => `display_name.ilike.%${t.replace(/[%,()]/g, '')}%`).join(',');
  const { data } = await sb
    .from('missing_person_pins_public')
    .select(PUBLIC_SELECT)
    .or(orFilter)
    .order('cluster_size', { ascending: false })
    .limit(400);

  const rows = (data as PublicRow[]) ?? [];
  const scored: MatchOut[] = [];
  for (const row of rows) {
    const r = scoreRecords(record, candidateToMatchable(row));
    if (!r.related) continue;
    scored.push({ ...redact(row), score: Number(r.score.toFixed(3)), method: r.method, confidence: r.confidence });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Plain search of the federated index (name + optional estado), redacted. */
export async function searchIndex(
  sb: SupabaseClient,
  opts: { q?: string | null; estado?: string | null; limit: number },
): Promise<ReturnType<typeof redact>[]> {
  let query = sb.from('missing_person_pins_public').select(PUBLIC_SELECT);
  if (opts.q) query = query.ilike('display_name', `%${opts.q.replace(/[%,()]/g, '')}%`);
  if (opts.estado) query = query.eq('estado', opts.estado);
  const { data } = await query.order('cluster_size', { ascending: false }).limit(opts.limit);
  return ((data as PublicRow[]) ?? []).map(redact);
}

/** Public sync feed for partners polling records changed since their last run. */
export async function changedSince(
  sb: SupabaseClient,
  opts: { since: string; limit: number },
): Promise<ReturnType<typeof redact>[]> {
  const { data } = await sb
    .from('missing_person_pins_public')
    .select(PUBLIC_SELECT)
    .gt('updated_at', opts.since)
    .order('updated_at', { ascending: true })
    .limit(opts.limit);
  return ((data as PublicRow[]) ?? []).map(redact);
}
