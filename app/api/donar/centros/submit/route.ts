/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

  const { data, error } = await sb.rpc('submit_donation_center', {
    p_ip_hash: ipHash(req),
    p_name: body.name,
    p_lat: body.lat ?? null,
    p_lng: body.lng ?? null,
    p_address: body.address ?? null,
    p_city: body.city ?? null,
    p_state: body.state ?? null,
    p_country_code: body.country_code ?? null,
    p_contact_public: body.contact_public ?? null,
    p_social: body.social ?? null,
    p_hours: body.hours ?? null,
    p_accepts: body.accepts ?? null,
    p_priority: body.priority ?? null,
    p_needs: body.needs ?? null,
    p_accepts_monetary: body.accepts_monetary ?? false,
    p_monetary_url: body.monetary_url ?? null,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: data?.ok ? 200 : 429 });
}
