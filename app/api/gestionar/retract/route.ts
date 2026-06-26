/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ENTITIES = new Set([
  'building', 'donation_center', 'organization',
  'help_request', 'inspection_request', 'misinfo_report',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Daily-rotating IP hash (matches the submit routes) — feeds the RPC's
// per-IP retract throttle so the throttle table can't be bloated with garbage.
function ipHash(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}|${day}|${process.env.REPORT_IP_SALT || 'respuesta-ve'}`).digest('hex');
}

// Retract one submission. Authorization = possession of the raw token, which
// we hash server-side (the raw token never reaches Postgres). The RPC verifies
// the hash matches the row and applies soft-retraction with life-safety guards.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  const { token, entity, id, reason } = body || {};
  // Tokens are randomBytes(24).toString('hex') = exactly 48 chars.
  if (!token || typeof token !== 'string' || token.length < 48) {
    return NextResponse.json({ ok: false, error: 'bad_token' }, { status: 400 });
  }
  if (!ENTITIES.has(entity) || typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });

  const token_hash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await sb.rpc('retract_submission', {
    p_entity: entity,
    p_id: id,
    p_token_hash: token_hash,
    p_reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null,
    p_ip_hash: ipHash(req),
  });

  // Never echo raw Postgres error text to the client.
  if (error) return NextResponse.json({ ok: false, error: 'retract_failed' }, { status: 400 });
  if (!data?.ok) {
    return NextResponse.json(data, { status: data?.error === 'rate_limited' ? 429 : 400 });
  }
  return NextResponse.json(data, { status: 200 });
}
