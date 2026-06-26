/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function ipHash(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}|${day}|${process.env.REPORT_IP_SALT || 'respuesta-ve'}`).digest('hex');
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });

  const token = randomBytes(24).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');

  const { data, error } = await sb.rpc('submit_organization', {
    p_ip_hash: ipHash(req),
    p_name: body.name,
    p_website_url: body.website_url ?? null,
    p_donation_url: body.donation_url ?? null,
    p_category: body.category ?? 'other',
    p_scope: body.scope ?? 'ambos',
    p_is_in_country: !!body.is_in_country,
    p_description: body.description ?? null,
    p_notes: body.notes ?? null,
    p_token_hash: token_hash,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (data?.ok) return NextResponse.json({ ...data, token, entity: 'organization' }, { status: 200 });
  return NextResponse.json(data, { status: 429 });
}
