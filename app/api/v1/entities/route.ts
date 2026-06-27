// /api/v1/entities
// Partner-facing federation for verified crisis entities: hospitals, shelters,
// orgs, supply hubs, their current needs, and public contribution channels.
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk, extractApiKey, readJsonBody, sha256Hex } from '@/lib/api/auth';
import { searchEntities, type PublicEntity } from '@/lib/api/entities';
import { EntityQuery, EntityUpsertRequest, zodMessage } from '@/lib/api/schemas';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, 'ingest');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const read = await readJsonBody(req);
  if (!read.ok) return apiError(read.error, read.error === 'payload_too_large' ? 413 : 400);
  const parsed = EntityUpsertRequest.safeParse(read.data);
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);
  const key = extractApiKey(req);
  if (!key) return apiError('missing_api_key', 401);

  const { entity, externalId, sourceUrl } = parsed.data;
  const { data, error } = await sb.rpc('submit_coordination_entity', {
    p_key_id: auth.keyId,
    p_key_hash: await sha256Hex(key),
    p_external_record_id: externalId,
    p_source_url: sourceUrl,
    p_entity_kind: entity.kind,
    p_name: entity.name,
    p_description: entity.description ?? null,
    p_estado: entity.estado ?? null,
    p_municipio: entity.municipio ?? null,
    p_lat: entity.lat ?? null,
    p_lng: entity.lng ?? null,
    p_address: entity.address ?? null,
    p_source_updated_at: entity.sourceUpdatedAt ?? null,
    p_channels: entity.channels,
    p_needs: entity.needs,
    p_audience_scope: entity.audienceScope ?? null,
    p_country_code: entity.countryCode ?? null,
  });

  const r = data as {
    ok?: boolean; id?: string; action?: string; error?: string;
    verification_status?: string; channels?: number; needs?: number;
  } | null;
  if (error) return apiError('entity_ingest_failed', 502);
  if (!r?.ok) {
    const status = r?.error === 'invalid_key' ? 401 : r?.error === 'insufficient_scope' ? 403 : 400;
    return apiError(r?.error ?? 'entity_ingest_failed', status);
  }
  return apiOk({
    id: r.id,
    action: r.action,
    verificationStatus: r.verification_status ?? null,
    channels: r.channels ?? 0,
    needs: r.needs ?? 0,
  }, auth, r.action === 'inserted' ? 201 : 200);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'search');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const sp = req.nextUrl.searchParams;
  const limitRaw = sp.get('limit');
  const parsed = EntityQuery.safeParse({
    q: sp.get('q') ?? undefined,
    kind: sp.get('kind') ?? undefined,
    estado: sp.get('estado') ?? undefined,
    audienceScope: sp.get('audienceScope') ?? undefined,
    countryCode: sp.get('countryCode') ?? undefined,
    limit: limitRaw == null ? undefined : Number(limitRaw),
  });
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });
  const query = parsed.data;
  if (!query.q && !query.kind && !query.estado && !query.audienceScope && !query.countryCode) {
    return apiError('validation_failed', 400, { detail: 'q, kind, estado, audienceScope, or countryCode is required' });
  }

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);
  let results: PublicEntity[];
  try {
    results = await searchEntities(sb, query);
  } catch {
    return apiError('entity_search_failed', 502);
  }
  return apiOk({ results, count: results.length }, auth);
}
