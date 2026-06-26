// POST /api/v1/score — pure one-to-many matching, no database.
// Run the full dedup engine (cédula → photo → name+age+locality) on records the
// partner already holds. Useful to dedupe a partner's OWN batch before sending.
import type { NextRequest } from 'next/server';
import { authenticate, apiError, apiOk, readJsonBody } from '@/lib/api/auth';
import { ScoreRequest, toMatchable, zodMessage } from '@/lib/api/schemas';
import { scoreAgainst } from '@/lib/api/matching';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, 'score');
  if (!auth.ok) return apiError(auth.error, auth.status, undefined, auth.retryAfter);

  const read = await readJsonBody(req);
  if (!read.ok) return apiError(read.error, read.error === 'payload_too_large' ? 413 : 400);
  const parsed = ScoreRequest.safeParse(read.data);
  if (!parsed.success) return apiError('validation_failed', 400, { detail: zodMessage(parsed.error) });

  const { record, candidates } = parsed.data;
  const rec = toMatchable(record);
  const cands = candidates.map((c) => toMatchable(c));
  const matches = scoreAgainst(rec, cands).map((m) => ({
    candidateIndex: m.index, score: m.score, method: m.method, confidence: m.confidence,
  }));

  return apiOk({ matches, count: matches.length }, auth);
}
