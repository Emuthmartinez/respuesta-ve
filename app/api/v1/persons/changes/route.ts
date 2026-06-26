// GET /api/v1/persons/changes — incremental public-safe sync feed.
// Partners poll this with their last cursor to see records whose accepted
// public projection changed elsewhere, then reconcile their own surfaces.
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk } from '@/lib/api/auth';
import { changedSince } from '@/lib/api/matching';
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

  const results = await changedSince(sb, { since, limit: parsed.data.limit });
  return apiOk({
    since,
    results,
    count: results.length,
    nextSince: results.at(-1)?.updatedAt ?? since,
  }, auth);
}
