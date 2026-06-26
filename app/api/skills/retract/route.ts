/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Account-path retraction for a skill offer. The RPC checks offerer_id =
// auth.uid() from the session cookie, so only the owner can retire their offer.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  const { offer_id, reason } = body || {};
  if (!offer_id) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ ok: false, error: 'backend_unconfigured' }, { status: 503 });

  const { data, error } = await sb.rpc('retract_skill_offer', {
    p_offer: offer_id,
    p_reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data?.ok) {
    return NextResponse.json(data, { status: data?.error === 'auth_required' ? 401 : 400 });
  }
  return NextResponse.json(data, { status: 200 });
}
