// Public badge lookup. Sites can render this result to show that their domain
// is verified by Respuesta VE as a federated partner.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { normalizeDomain, verifyBadge } from '@/lib/api/entities';
import { BadgeQuery, zodMessage } from '@/lib/api/schemas';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const parsed = BadgeQuery.safeParse({
    domain: req.nextUrl.searchParams.get('domain') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation_failed', detail: zodMessage(parsed.error) }, { status: 400 });
  }
  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) return NextResponse.json({ ok: false, error: 'invalid_domain' }, { status: 400 });

  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ ok: false, error: 'service_unavailable' }, { status: 503 });
  let badge: Awaited<ReturnType<typeof verifyBadge>>;
  try {
    badge = await verifyBadge(sb, domain);
  } catch {
    return NextResponse.json({ ok: false, error: 'badge_lookup_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ...badge }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
