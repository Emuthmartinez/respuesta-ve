import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { authFallbackForNext, normalizeAuthNext, withAuthError } from '@/lib/auth-redirect';

// Supabase redirects here after OAuth / magic-link / email confirmation. The PKCE
// code verifier lives in a first-party cookie (sb-<ref>-auth-token-code-verifier)
// that is sent with this request, so the server client can complete the exchange
// and set the session cookies in a single hop — the canonical @supabase/ssr flow,
// with no second client and no client-side race (detectSessionInUrl is off, so the
// browser client never double-consumes the code).
//
// If the server cannot complete (e.g. the verifier cookie wasn't sent), we fall
// back to the browser finisher at /auth/finish, which reads the verifier from
// document.cookie and exchanges client-side.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = normalizeAuthNext(searchParams.get('next'));
  const error = searchParams.get('error_description') ?? searchParams.get('error');

  if (code && !error) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError) return NextResponse.redirect(`${origin}${next}`);
      // Exchange failed server-side without consuming the code (verifier missing
      // server-side) — let the browser finisher try with the document.cookie copy.
    }
  }

  const finish = new URL('/auth/finish', origin);
  finish.searchParams.set('next', next);
  if (code) finish.searchParams.set('code', code);
  if (error) finish.searchParams.set('error', error);
  if (code || error) return NextResponse.redirect(finish);

  return NextResponse.redirect(`${origin}${withAuthError(authFallbackForNext(next))}`);
}
