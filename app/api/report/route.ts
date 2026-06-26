/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Hash the client IP server-side (never stored raw) with a daily-rotating salt.
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

  const sb = await getSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });
  }

  // Mint a one-time management token. The raw token is returned to the
  // submitter (their only handle to later manage/retract the report); only
  // its sha256 is stored, so possession of the token == ownership.
  const token = randomBytes(24).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');

  const { data, error } = await sb.rpc('submit_building_report', {
    p_ip_hash: ipHash(req),
    p_lat: body.lat,
    p_lng: body.lng,
    p_estado: body.estado ?? null,
    p_municipio: body.municipio ?? null,
    p_parroquia: body.parroquia ?? null,
    p_address: body.address ?? null,
    p_description: body.description ?? null,
    p_damage_level: body.damage_level ?? 'unknown',
    p_people_status: body.people_status ?? 'unknown',
    p_people_count_estimate: body.people_count_estimate ?? null,
    p_reporter_contact: body.reporter_contact ?? null,
    p_construction_type: body.construction_type ?? null,
    p_floors: body.floors ?? null,
    p_occupancy_type: body.occupancy_type ?? null,
    p_hazard_flags: body.hazard_flags ?? null,
    p_collapse_mode: body.collapse_mode ?? null,
    p_access_status: body.access_status ?? null,
    p_evacuated: body.evacuated ?? null,
    p_landmark: body.landmark ?? null,
    p_source_channel: 'web_form',
    p_token_hash: token_hash,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  // data is the JSON the RPC returns: { ok, id, status } or { ok:false, error }.
  // On success, hand back the raw token so the submitter can manage the report.
  if (data?.ok) {
    return NextResponse.json({ ...data, token, entity: 'building' }, { status: 200 });
  }
  return NextResponse.json(data, { status: 429 });
}
