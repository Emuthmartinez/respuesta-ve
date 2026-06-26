/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
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

  const { data, error } = await sb.rpc('submit_skill_offer', {
    p_ip_hash: ipHash(req),
    p_skill_category: body.skill_category,
    p_skill_detail: body.skill_detail ?? null,
    p_languages: body.languages ?? null,
    p_estado: body.estado ?? null,
    p_operating_estados: body.operating_estados ?? null,
    p_contact: body.contact ?? null,
    p_credential_doc_path: body.credential_doc_path ?? null,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data?.ok) return NextResponse.json(data, { status: data?.error === 'auth_required' ? 401 : 400 });
  return NextResponse.json(data);
}
