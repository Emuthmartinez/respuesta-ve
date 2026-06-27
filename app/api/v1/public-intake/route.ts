import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/auth';
import {
  buildPublicIntakeSubmission,
  MAX_PUBLIC_INTAKE_BODY_BYTES,
  readPublicIntakePayload,
} from '@/lib/api/public-intake';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function ipHash(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.REPORT_IP_SALT || 'respuesta-ve';
  return createHash('sha256').update(`${ip}|${day}|${salt}`).digest('hex');
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/public-intake',
    auth: 'No API key required.',
    maxBytes: MAX_PUBLIC_INTAKE_BODY_BYTES,
    accepts: ['application/json', 'text/plain', 'text/csv'],
    status: 'received_for_review',
    privacy:
      'Raw payloads, contacts, notes, and URLs are stored in a restricted operator queue. The response returns only a receipt, never the submitted data.',
    example: {
      source: 'discord',
      kind: 'url_list',
      data: ['https://example.org/report/123'],
      note: 'Share any source, spreadsheet row, scraped text, or JSON shape that needs review.',
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}

export async function POST(req: Request) {
  const parsed = await readPublicIntakePayload(req);
  if (!parsed.ok) {
    const status = parsed.error === 'payload_too_large' ? 413 : 400;
    return apiError(parsed.error, status);
  }

  const submission = buildPublicIntakeSubmission(parsed.payload, parsed.rawText, parsed.contentType);
  const sb = await getSupabaseServer();
  if (!sb) return apiError('service_unavailable', 503);

  const { data, error } = await sb.rpc('submit_public_data_intake', {
    p_ip_hash: ipHash(req),
    p_event_id: submission.eventId,
    p_source: submission.source,
    p_source_url: submission.sourceUrl,
    p_received_via: submission.receivedVia,
    p_payload_format: submission.payloadFormat,
    p_submission_kind: submission.submissionKind,
    p_payload: submission.payload,
    p_payload_size_chars: submission.payloadSizeChars,
    p_urls_to_review: submission.urlsToReview,
    p_tags: submission.tags,
    p_submitted_by_private: submission.submittedByPrivate,
    p_contact_private: submission.contactPrivate,
    p_note_private: submission.notePrivate,
    p_warnings: submission.warnings,
  });

  if (error) return apiError('intake_unavailable', 503);

  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    const code = result?.error ?? 'intake_rejected';
    return apiError(code, code === 'rate_limited' ? 429 : 400);
  }

  return NextResponse.json(result, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
