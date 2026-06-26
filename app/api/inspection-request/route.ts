/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  if (body.lat != null && (body.lat < 0 || body.lat > 16)) {
    return NextResponse.json({ ok: false, error: 'out_of_bounds' }, { status: 400 });
  }
  if (body.lng != null && (body.lng < -74 || body.lng > -59)) {
    return NextResponse.json({ ok: false, error: 'out_of_bounds' }, { status: 400 });
  }

  const sb = await getSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });
  }

  // Anonymous requesters get a raw token; only its hash is stored. The token
  // is the only way to later poll status via get_inspection_request_status.
  const token = randomBytes(24).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');

  const { error } = await sb.from('inspection_requests').insert({
    building_id: body.building_id ?? null,
    needs_type: body.needs_type ?? 'structural_safety',
    requester_contact: body.requester_contact ?? null,
    contact_window: body.contact_window ?? null,
    access_status: body.access_status ?? null,
    people_inside_at_submission: !!body.people_inside_at_submission,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    estado: body.estado ?? null,
    municipio: body.municipio ?? null,
    parroquia: body.parroquia ?? null,
    address: body.address ?? null,
    description: body.description ?? null,
    token_hash,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, token });
}
