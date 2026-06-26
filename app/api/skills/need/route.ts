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

  const { data, error } = await sb.rpc('submit_help_request', {
    p_ip_hash: ipHash(req),
    p_token_hash: token_hash,
    p_skill_needed: body.skill_needed,
    p_urgency: body.urgency ?? 'normal',
    p_num_people: body.num_people ?? null,
    p_has_minor_children: !!body.has_minor_children,
    p_estado: body.estado ?? null,
    p_municipio: body.municipio ?? null,
    p_description: body.description ?? null,
    p_contact: body.contact ?? null,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data?.ok) return NextResponse.json(data, { status: data?.error === 'auth_required' ? 401 : 400 });
  return NextResponse.json({ ok: true, token, id: data.id });
}
