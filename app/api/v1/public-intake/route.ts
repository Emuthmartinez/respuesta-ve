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

type IntakeReceipt = { ok?: boolean; id?: unknown; error?: string } & Record<string, unknown>;

function ipHash(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.REPORT_IP_SALT || 'respuesta-ve';
  return createHash('sha256').update(`${ip}|${day}|${salt}`).digest('hex');
}

function statusUrl(req: Request, id: unknown): string | null {
  if (typeof id !== 'string' || !id) return null;
  const url = new URL(req.url);
  url.search = new URLSearchParams({ id }).toString();
  return url.toString();
}

function withStatusUrl(req: Request, receipt: IntakeReceipt): IntakeReceipt {
  const url = statusUrl(req, receipt.id);
  return url ? { ...receipt, statusUrl: url } : receipt;
}

function publicIntakeRpcSecret(): string | null {
  const secret = process.env.PUBLIC_INTAKE_RPC_SECRET?.trim();
  return secret || null;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return apiError('bad_id', 400);
    }
    const sb = await getSupabaseServer();
    if (!sb) return apiError('service_unavailable', 503);
    const { data, error } = await sb.rpc('get_public_data_intake_receipt', { p_id: id });
    if (error) return apiError('receipt_unavailable', 503);
    const receipt = data as IntakeReceipt | null;
    if (!receipt?.ok) return apiError(receipt?.error ?? 'not_found', receipt?.error === 'not_found' ? 404 : 400);
    return NextResponse.json(withStatusUrl(req, receipt), { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/public-intake',
    statusEndpoint: 'GET /api/v1/public-intake?id=<receipt-id>',
    access: 'Public submission route for restricted operator review.',
    maxBytes: MAX_PUBLIC_INTAKE_BODY_BYTES,
    accepts: ['application/json', 'text/plain', 'text/csv', 'JSON envelopes with small file data URLs/text extracts'],
    status: 'received_for_review',
    cleanupContract:
      'Send sourceRecordId, contentFingerprint, processingHints, and canonicalCandidates when available. Operators use those restricted fields to dedupe/clean the queue, then promote safe records through /api/v1/persons or /api/v1/entities.',
    downstreamFetch:
      'Providers poll their receipt statusUrl for intake processing status. After review/promotion, partners poll /api/v1/persons/changes and /api/v1/entities/changes with a since cursor to fetch normalized canonical data.',
    privacy:
      'Raw payloads, contacts, notes, URLs, content fingerprints, candidate records, and image data stay in a restricted operator queue. The response returns only a receipt, never the submitted data.',
    example: {
      eventId: 'venezuela-earthquakes-2026',
      source: 'mapa-emergencia-rescate',
      sourceRecordId: 'mapa-emergencia-rescate:hospital:123',
      contentFingerprint: 'sha256:...',
      kind: 'entity',
      audienceScope: 'in_venezuela',
      processingHints: {
        dedupeMode: 'candidate_review_not_auto_merge',
        promotionPath: '/api/v1/entities',
        cleanupPipeline: ['normalize_entity', 'dedupe_entity_by_name_area', 'operator_promote_safe_records'],
      },
      canonicalCandidates: [{
        kind: 'entity',
        externalId: 'mapa-emergencia-rescate:hospital:123',
        sourceUrl: 'https://terremotovenezuela.app/hospitales/hospital-central',
        entity: {
          kind: 'hospital',
          name: 'Hospital Central',
          estado: 'Lara',
          municipio: 'Barquisimeto',
          audienceScope: 'in_venezuela',
          countryCode: 'VE',
          needs: [{ category: 'medical_supplies', title: 'Gasas', urgency: 'high' }],
        },
      }],
      data: {
        note: 'Share any source, spreadsheet row, scraped text, photo metadata, or JSON shape that needs review.',
      },
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
  const rpcSecret = publicIntakeRpcSecret();
  if (!rpcSecret) return apiError('service_unavailable', 503);

  const { data, error } = await sb.rpc('submit_public_data_intake', {
    p_rpc_secret: rpcSecret,
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

  const result = data as IntakeReceipt | null;
  if (!result?.ok) {
    const code = result?.error ?? 'intake_rejected';
    return apiError(code, code === 'rate_limited' ? 429 : code === 'forbidden' ? 503 : 400);
  }

  return NextResponse.json(withStatusUrl(req, result), { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
