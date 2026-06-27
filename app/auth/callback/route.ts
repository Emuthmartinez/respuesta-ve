import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

// Handles the redirect from a Supabase magic-link / OTP email: exchanges the
// one-time code for a session cookie, then sends the responder onward.
const ALLOWED_NEXT = new Set([
  '/voluntarios',
  '/voluntarios/cola',
  '/voluntarios/registrarse',
  '/voluntarios/moderacion',
  '/voluntarios/responders',
  '/desarrolladores/claves',
]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/voluntarios';
  const next = ALLOWED_NEXT.has(rawNext) ? rawNext : '/voluntarios';

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/voluntarios?error=auth`);
}
