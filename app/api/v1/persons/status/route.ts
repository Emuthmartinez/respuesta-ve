// GET /api/v1/persons/status?externalId=...
// Returns a partner-owned record plus accepted duplicate/status signals from
// other sources. This is the "site B learns site A found the person" endpoint.
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk, extractApiKey, sha256Hex } from '@/lib/api/auth';
import { redact, type PublicRow, type RedactedRecord } from '@/lib/api/redact';
import { StatusQuery, zodMessage } from '@/lib/api/schemas';
import { summarizeStatus } from '@/lib/api/status';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface StatusRpcRow extends PublicRow {
  relation: 'self' | 'duplicate' | 'merged_into';
  quality_status: string;
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'search');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const parsed = StatusQuery.safeParse({
    externalId: req.nextUrl.searchParams.get('externalId') ?? '',
  });
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);

  const key = extractApiKey(req);
  if (!key) return apiError('missing_api_key', 401);
  const keyHash = await sha256Hex(key);

  const { data, error } = await sb.rpc('partner_missing_person_status', {
    p_key_id: auth.keyId,
    p_key_hash: keyHash,
    p_external_record_id: parsed.data.externalId,
  });
  if (error) return apiError('status_unavailable', 502);

  const rows = (data as StatusRpcRow[]) ?? [];
  if (rows.length === 0) return apiError('not_found', 404);

  const members = rows.map((row) => ({
    relation: row.relation,
    qualityStatus: row.quality_status,
    record: redact(row),
  }));
  const own = members.find((m) => m.relation === 'self');
  const publicRecords: RedactedRecord[] = members.map((m) => m.record);

  return apiOk({
    externalId: parsed.data.externalId,
    record: own?.record ?? publicRecords[0],
    qualityStatus: own?.qualityStatus ?? null,
    cluster: summarizeStatus(publicRecords, own?.record.id),
    members,
  }, auth);
}
