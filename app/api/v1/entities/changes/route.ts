// GET /api/v1/entities/changes — incremental sync for verified crisis entities.
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk } from '@/lib/api/auth';
import { entityChangesSince, type PublicEntity } from '@/lib/api/entities';
import { ChangesQuery, zodMessage } from '@/lib/api/schemas';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function parseSince(raw: string): string | null {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'search');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const sp = req.nextUrl.searchParams;
  const limitRaw = sp.get('limit');
  const parsed = ChangesQuery.safeParse({
    since: sp.get('since') ?? '',
    limit: limitRaw == null ? undefined : Number(limitRaw),
  });
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });
  const since = parseSince(parsed.data.since);
  if (!since) return apiError('validation_failed', 400, { detail: 'since must be an ISO timestamp' });

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);
  let results: PublicEntity[];
  try {
    results = await entityChangesSince(sb, { since, limit: parsed.data.limit });
  } catch {
    return apiError('entity_changes_failed', 502);
  }
  return apiOk({
    since,
    results,
    count: results.length,
    nextSince: results.at(-1)?.updatedAt ?? since,
  }, auth);
}
