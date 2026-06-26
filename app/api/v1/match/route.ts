// POST /api/v1/match — "is this person already in the registry?"
// Matches a record against the LIVE federated index by name + age + locality and
// returns ranked redacted matches (public metadata only, with link-back URLs).
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk, readJsonBody } from '@/lib/api/auth';
import { MatchRequest, toMatchable, zodMessage } from '@/lib/api/schemas';
import { matchAgainstIndex } from '@/lib/api/matching';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, 'match');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const read = await readJsonBody(req);
  if (!read.ok) return apiError(read.error, read.error === 'payload_too_large' ? 413 : 400);
  const parsed = MatchRequest.safeParse(read.data);
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });

  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);

  const matches = await matchAgainstIndex(sb, toMatchable(parsed.data.record), parsed.data.limit);
  return apiOk({ matches, count: matches.length }, auth);
}
