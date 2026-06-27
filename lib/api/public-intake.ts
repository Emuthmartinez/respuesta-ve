export const MAX_PUBLIC_INTAKE_BODY_BYTES = 5 * 1024 * 1024;
export const PUBLIC_INTAKE_EVENT_ID = 'venezuela-earthquakes-2026';

const FORMATS = ['json', 'csv', 'url_list', 'text', 'unknown'] as const;
const KINDS = ['person', 'entity', 'need', 'status', 'media', 'url_list', 'mixed', 'unknown'] as const;

export type PublicIntakePayloadFormat = typeof FORMATS[number];
export type PublicIntakeSubmissionKind = typeof KINDS[number];

export interface PublicIntakeParseOk {
  ok: true;
  payload: unknown;
  rawText: string;
  contentType: string;
}

export interface PublicIntakeParseErr {
  ok: false;
  error: 'empty_body' | 'invalid_json' | 'payload_too_large';
}

export interface PublicIntakeSubmission {
  eventId: string;
  source: string;
  sourceUrl: string | null;
  receivedVia: string;
  payloadFormat: PublicIntakePayloadFormat;
  submissionKind: PublicIntakeSubmissionKind;
  payload: unknown;
  payloadSizeChars: number;
  urlsToReview: string[];
  tags: string[];
  submittedByPrivate: string | null;
  contactPrivate: string | null;
  notePrivate: string | null;
  warnings: string[];
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]}]+/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\u0000/g, '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function pickText(record: Record<string, unknown>, keys: string[], max: number): string | null {
  for (const key of keys) {
    const value = cleanText(record[key], max);
    if (value) return value;
  }
  return null;
}

function normalizeHttpUrl(value: unknown, max = 500): string | null {
  const raw = cleanText(value, max);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pickTags(record: Record<string, unknown>): string[] {
  const value = record.tags ?? record.labels ?? record.categories;
  const input = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(input
    .map((item) => cleanText(item, 40))
    .filter((item): item is string => !!item))]
    .slice(0, 20);
}

function enumValue<T extends readonly string[]>(value: unknown, options: T): T[number] | null {
  const text = cleanText(value, 40)?.toLowerCase();
  return text && (options as readonly string[]).includes(text) ? text as T[number] : null;
}

function inferFormat(payload: unknown, contentType: string, explicit: unknown): PublicIntakePayloadFormat {
  const requested = enumValue(explicit, FORMATS);
  if (requested) return requested;
  if (Array.isArray(payload)) return payload.every((item) => typeof item === 'string' && normalizeHttpUrl(item)) ? 'url_list' : 'json';
  if (isRecord(payload)) return 'json';
  if (typeof payload !== 'string') return 'json';
  if (/csv/i.test(contentType) || payload.includes(',') && payload.includes('\n')) return 'csv';
  if (normalizeHttpUrl(payload) || [...payload.matchAll(URL_RE)].length > 0) return 'url_list';
  return 'text';
}

function inferKind(payload: unknown, explicit: unknown, format: PublicIntakePayloadFormat): PublicIntakeSubmissionKind {
  const requested = enumValue(explicit, KINDS);
  if (requested) return requested;
  const haystack = JSON.stringify(payload).toLowerCase();
  const hits = new Set<PublicIntakeSubmissionKind>();
  if (format === 'url_list') hits.add('url_list');
  if (/\b(person|persona|missing|desaparecid|cedula|lastseen|last_seen)\b/.test(haystack)) hits.add('person');
  if (/\b(hospital|shelter|refugio|organization|organizacion|centro|clinic|entity)\b/.test(haystack)) hits.add('entity');
  if (/\b(need|necesita|request|urgent|supply|insumo|agua|food|medicine|medicina)\b/.test(haystack)) hits.add('need');
  if (/\b(status|estado|found|safe|ubicad|resolved|actualiz)\b/.test(haystack)) hits.add('status');
  if (/\b(photo|image|video|media|foto|imagen)\b/.test(haystack)) hits.add('media');
  if (hits.size > 1) return 'mixed';
  return [...hits][0] ?? 'unknown';
}

function addUrls(value: unknown, out: Set<string>, warnings: Set<string>, depth = 0): void {
  if (out.size >= 50 || depth > 8 || value == null) return;
  if (typeof value === 'string') {
    for (const match of value.matchAll(URL_RE)) {
      const url = normalizeHttpUrl(match[0].replace(/[.,;:!?]+$/, ''));
      if (url) out.add(url);
      if (out.size >= 50) {
        warnings.add('urls_truncated');
        return;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) addUrls(item, out, warnings, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value).slice(0, 100)) addUrls(item, out, warnings, depth + 1);
  }
}

export async function readPublicIntakePayload(req: Request): Promise<PublicIntakeParseOk | PublicIntakeParseErr> {
  const len = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(len) && len > MAX_PUBLIC_INTAKE_BODY_BYTES) return { ok: false, error: 'payload_too_large' };

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!rawText.trim()) return { ok: false, error: 'empty_body' };
  if (rawText.length > MAX_PUBLIC_INTAKE_BODY_BYTES) return { ok: false, error: 'payload_too_large' };

  const contentType = req.headers.get('content-type') ?? '';
  const looksJson = /json/i.test(contentType) || /^[\[{"]/.test(rawText.trim());
  if (!looksJson) return { ok: true, payload: rawText, rawText, contentType };

  try {
    return { ok: true, payload: JSON.parse(rawText), rawText, contentType };
  } catch {
    return /json/i.test(contentType) ? { ok: false, error: 'invalid_json' } : { ok: true, payload: rawText, rawText, contentType };
  }
}

export function buildPublicIntakeSubmission(payload: unknown, rawText: string, contentType = ''): PublicIntakeSubmission {
  const root = isRecord(payload) ? payload : {};
  const warnings = new Set<string>();
  const urls = new Set<string>();
  addUrls(payload, urls, warnings);

  const source = pickText(root, ['source', 'sourceName', 'origin', 'platform'], 120) ?? 'anonymous-public-intake';
  const sourceUrl = normalizeHttpUrl(root.sourceUrl ?? root.url ?? root.link ?? root.originUrl);
  const payloadFormat = inferFormat(payload, contentType, root.payloadFormat ?? root.format);
  const submissionKind = inferKind(payload, root.kind ?? root.submissionKind ?? root.type, payloadFormat);

  const contactPrivate = pickText(root, ['contact', 'contactPrivate', 'reporterContact', 'phone', 'email', 'whatsapp'], 300);
  const notePrivate = pickText(root, ['note', 'notes', 'message', 'description', 'privateNote'], 1000);
  if (contactPrivate) warnings.add('contact_stored_private');
  if (!sourceUrl && (root.sourceUrl || root.url || root.link || root.originUrl)) warnings.add('source_url_ignored');
  if (submissionKind === 'unknown') warnings.add('submission_kind_unknown');

  return {
    eventId: pickText(root, ['eventId', 'event', 'disasterId'], 120) ?? PUBLIC_INTAKE_EVENT_ID,
    source,
    sourceUrl,
    receivedVia: pickText(root, ['receivedVia', 'channel'], 80) ?? 'public_api',
    payloadFormat,
    submissionKind,
    payload,
    payloadSizeChars: rawText.length,
    urlsToReview: [...urls],
    tags: pickTags(root),
    submittedByPrivate: pickText(root, ['submittedBy', 'submitted_by', 'name', 'reporterName'], 200),
    contactPrivate,
    notePrivate,
    warnings: [...warnings],
  };
}
