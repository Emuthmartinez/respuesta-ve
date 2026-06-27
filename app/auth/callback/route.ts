import { NextResponse } from 'next/server';
import { authFallbackForNext, normalizeAuthNext, withAuthError } from '@/lib/auth-redirect';

// Supabase redirects here first. The browser created the PKCE verifier when the
// user clicked sign in, so we hand the one-time code to /auth/finish where the
// browser client can complete the exchange and set the session cookies.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = normalizeAuthNext(searchParams.get('next'));
  const error = searchParams.get('error_description') ?? searchParams.get('error');

  const finish = new URL('/auth/finish', origin);
  finish.searchParams.set('next', next);
  if (code) finish.searchParams.set('code', code);
  if (error) finish.searchParams.set('error', error);

  if (code || error) return NextResponse.redirect(finish);

  return NextResponse.redirect(`${origin}${withAuthError(authFallbackForNext(next))}`);
}
