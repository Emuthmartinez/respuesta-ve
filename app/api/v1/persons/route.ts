// /api/v1/persons
//   POST — dedupe-on-ingest: federate a partner's record into the shared index.
//          Finds likely existing matches, then stores via the controlled RPC
//          (link-back required, consent/photo forced off). Idempotent per
//          (source, externalId). Returns the stored id + the matches it found.
//   GET  — search the federated index by name + optional estado (redacted).
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk, readJsonBody } from '@/lib/api/auth';
import { IngestRequest, toMatchable, zodMessage } from '@/lib/api/schemas';
import { matchAgainstIndex, searchIndex } from '@/lib/api/matching';
import { getSupabaseServer } from '@/lib/supabase/server';
import { normalizeCedula, nameBlockKey, detectMultiPerson } from '@/lib/missing-persons';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, 'ingest');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const read = await readJsonBody(req);
  if (!read.ok) return apiError(read.error, read.error === 'payload_too_large' ? 413 : 400);
  const parsed = IngestRequest.safeParse(read.data);
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });

  const { record, externalId, externalUrl } = parsed.data;
  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);

  // Idempotency key is namespaced by the partner's key, so one partner can NEVER
  // overwrite another's record by reusing an externalId. Source attribution comes
  // from the key (coordinator-set), NOT the request body — partners can't
  // impersonate a known registry.
  const recordKey = `partner-${auth.keyId}:${externalId}`;
  const effectiveSource = auth.ingestSource;

  // 1) Surface likely existing matches (advisory; we never auto-merge).
  const matches = await matchAgainstIndex(sb, toMatchable(record), 10);
  const dupIds = matches.filter((m) => m.confidence !== 'review').map((m) => m.id);

  // 2) Store via the controlled federation RPC. The secret bypass token (a
  //    server-only env var) lets this trusted, already-rate-limited path skip
  //    the RPC's own 500/hr throttle; if it's unset we fall back to a per-key
  //    bucket so the cap still applies. The token is never guessable by anon.
  const { data, error } = await sb.rpc('submit_missing_person_record', {
    p_ip_hash: process.env.FEDERATION_BYPASS_TOKEN || `api-${auth.keyId}`,
    p_external_record_id: recordKey,
    p_source: effectiveSource,
    p_external_url: externalUrl,
    p_display_name: record.name,
    p_last_seen_lat: null,
    p_last_seen_lng: null,
    p_last_seen_at: null,
    p_estado: record.estado ?? null,
    p_municipio: record.municipio ?? null,
    p_age_estimate: record.age ?? null,
    p_cedula: record.cedula ?? null,
    p_status: record.status ?? 'missing',
    p_notes: null,
    p_source_updated_at: record.lastSeenAt ?? null,
    p_possible_duplicate_ids: dupIds.length ? dupIds : null,
    p_dedupe_score: matches[0]?.score ?? null,
    p_cedula_normalized: normalizeCedula(record.cedula),
    p_photo_phash: record.photoPhash ? record.photoPhash.toLowerCase() : null,
    p_name_phonetic: nameBlockKey(record.name) || null,
    p_is_multi_person: detectMultiPerson(record.name),
    p_cluster_reason: dupIds.length ? ['name'] : null,
  });

  const r = data as { ok?: boolean; id?: string; action?: string; error?: string } | null;
  if (error || !r?.ok) {
    return apiError(r?.error ?? 'ingest_failed', 502);
  }
  return apiOk({ id: r.id, action: r.action, possibleMatches: matches, matchCount: matches.length }, auth, r.action === 'inserted' ? 201 : 200);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'search');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim() || null;
  const estado = sp.get('estado')?.trim() || null;
  const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
  if (!q && !estado) return apiError('validation_failed', 400, { detail: 'q or estado is required' });
  // Min length blocks single-character enumeration of the whole registry.
  if (q && q.length < 2) return apiError('validation_failed', 400, { detail: 'q must be at least 2 characters' });

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);

  const results = await searchIndex(sb, { q, estado, limit });
  return apiOk({ results, count: results.length }, auth);
}
