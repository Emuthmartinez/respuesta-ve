// Partner-API authentication + rate limiting.
//
// API keys are bearer tokens (format `rvk_<random>`), hashed with SHA-256 before
// they ever touch the database. We never store or log the plaintext. A single
// SECURITY DEFINER RPC (verify_api_key) does lookup + scope check + sliding-
// window rate limit atomically, so the stateless Cloudflare Worker needs one
// round-trip and a leaked anon key can't read the key table.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export type ApiScope = 'score' | 'match' | 'search' | 'ingest';

export interface AuthOk {
  ok: true;
  keyId: string;
  name: string;
  scopes: ApiScope[];
  /** The source records ingested with this key are attributed to (coordinator-set;
   * partners cannot impersonate a registry via the request body). */
  ingestSource: string;
  remainingMin: number;
  remainingDay: number;
}
export interface AuthErr {
  ok: false;
  error: string;
  status: number;
  retryAfter?: number;
}
export type AuthResult = AuthOk | AuthErr;

/** Max request body we will parse — bounds memory/CPU before any JSON work. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Read + size-cap a JSON body. Returns a discriminated result the route maps to 413/400. */
export async function readJsonBody(req: NextRequest): Promise<{ ok: true; data: unknown } | { ok: false; error: 'payload_too_large' | 'invalid_json' }> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return { ok: false, error: 'payload_too_large' };
  let text: string;
  try { text = await req.text(); } catch { return { ok: false, error: 'invalid_json' }; }
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'payload_too_large' };
  try { return { ok: true, data: JSON.parse(text) }; } catch { return { ok: false, error: 'invalid_json' }; }
}

/** SHA-256 hex via Web Crypto (works in both the Edge runtime and Node). */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Extract the API key from `Authorization: Bearer …` or `x-api-key`. */
export function extractApiKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const x = req.headers.get('x-api-key');
  return x ? x.trim() : null;
}

/** Authenticate a request for a given scope, applying the per-key rate limit. */
export async function authenticate(req: NextRequest, scope: ApiScope): Promise<AuthResult> {
  const key = extractApiKey(req);
  if (!key || key.length < 16) {
    return { ok: false, error: 'missing_api_key', status: 401 };
  }
  const sb = await getSupabaseServer();
  if (!sb) return { ok: false, error: 'service_unavailable', status: 503 };

  const hash = await sha256Hex(key);
  const { data, error } = await sb.rpc('verify_api_key', { p_key_hash: hash, p_scope: scope });
  if (error) return { ok: false, error: 'auth_unavailable', status: 503 };

  const r = data as {
    ok?: boolean; error?: string; key_id?: string; name?: string; scopes?: ApiScope[];
    ingest_source?: string; remaining_min?: number; remaining_day?: number; retry_after?: number;
  } | null;

  if (!r?.ok) {
    const e = r?.error ?? 'invalid_key';
    const status = e === 'rate_limited' ? 429 : e === 'insufficient_scope' ? 403 : 401;
    return { ok: false, error: e, status, retryAfter: r?.retry_after };
  }
  return {
    ok: true, keyId: r.key_id!, name: r.name ?? '', scopes: r.scopes ?? [],
    ingestSource: r.ingest_source ?? 'other',
    remainingMin: r.remaining_min ?? 0, remainingDay: r.remaining_day ?? 0,
  };
}

/** Standard JSON error envelope with rate-limit headers. */
export function apiError(error: string, status: number, extra?: Record<string, unknown>, retryAfter?: number): NextResponse {
  const headers: Record<string, string> = {};
  if (retryAfter != null) headers['Retry-After'] = String(retryAfter);
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers });
}

/** Standard JSON success envelope with remaining-quota headers. */
export function apiOk(body: Record<string, unknown>, auth: AuthOk, status = 200): NextResponse {
  return NextResponse.json(
    { ok: true, ...body },
    {
      status,
      headers: {
        'X-RateLimit-Remaining-Minute': String(auth.remainingMin),
        'X-RateLimit-Remaining-Day': String(auth.remainingDay),
        'Cache-Control': 'no-store',
      },
    },
  );
}
