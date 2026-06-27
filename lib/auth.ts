import { getSupabaseServer } from '@/lib/supabase/server';

export interface ResponderProfile {
  id: string;
  full_name: string;
  credential_type: string;
  credential_number: string | null;
  organization: string | null;
  verification: 'pending' | 'verified' | 'rejected';
  tier: 'provisional' | 'verified' | 'senior';
  is_coordinator: boolean;
  suspended_at: string | null;
}

// Loads the signed-in user and their responder profile (null if none).
export async function getResponderProfile(): Promise<{
  user: { id: string; email?: string } | null;
  responder: ResponderProfile | null;
}> {
  const sb = await getSupabaseServer();
  if (!sb) return { user: null, responder: null };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { user: null, responder: null };

  const { data: responder } = await sb
    .from('responders')
    .select(
      'id, full_name, credential_type, credential_number, organization, verification, tier, is_coordinator, suspended_at',
    )
    .eq('id', user.id)
    .maybeSingle();

  return { user: { id: user.id, email: user.email }, responder: responder ?? null };
}

export function isActiveVerified(r: ResponderProfile | null): boolean {
  return !!r && r.verification === 'verified' && !r.suspended_at;
}

// Default landing page when no (valid) destination is supplied.
export const DEFAULT_NEXT = '/voluntarios';

// Validates a post-login `next` target. Only same-origin *relative* paths are
// allowed — this is the open-redirect guard for the sign-in flow. Anything
// absolute (`https://…`), protocol-relative (`//evil.com`), or backslash-tricked
// (`/\evil.com`) falls back to DEFAULT_NEXT.
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return DEFAULT_NEXT;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
  return raw;
}

// Builds the sign-in URL for a protected page, remembering where the user was
// headed so the callback can return them there after authenticating.
export function signInPath(next?: string): string {
  const target = safeNext(next);
  return target === DEFAULT_NEXT
    ? '/voluntarios/acceder'
    : `/voluntarios/acceder?next=${encodeURIComponent(target)}`;
}
