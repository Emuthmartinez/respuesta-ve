/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Hash the client IP server-side (never stored raw) with a daily-rotating salt.
// Mirrors /api/report so one IP = one crowd vote per building per day.
function ipHash(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.REPORT_IP_SALT || 'respuesta-ve';
  return createHash('sha256').update(`${ip}|${day}|${salt}`).digest('hex');
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  if (!body?.building_id || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  // Cookie-aware client: a signed-in responder/coordinator is identified by
  // auth.uid() inside the RPC (→ instant graduation); anon users take the
  // crowd path keyed on the IP hash.
  const sb = await getSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });
  }

  const { data, error } = await sb.rpc('confirm_building_location', {
    p_building_id: body.building_id,
    p_lat: body.lat,
    p_lng: body.lng,
    p_ip_hash: ipHash(req),
    p_note: body.note ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  // data is the JSON the RPC returns:
  //   { ok:true, status:'confirmed', source } | { ok:true, status:'provisional', confirmations, needed }
  //   | { ok:false, error }
  return NextResponse.json(data, { status: data?.ok ? 200 : 400 });
}
