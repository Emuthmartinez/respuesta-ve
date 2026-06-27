import type { Metadata } from 'next';
import { AuthFinish } from '@/components/AuthFinish';
import { authFallbackForNext, normalizeAuthNext } from '@/lib/auth-redirect';
import { getSupabasePublicConfig } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Terminando inicio de sesion · Respuesta VE',
  alternates: { canonical: '/auth/finish' },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuthFinishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = normalizeAuthNext(first(params.next));
  const error = first(params.error_description) ?? first(params.error);

  return (
    <AuthFinish
      code={first(params.code)}
      error={error}
      nextPath={nextPath}
      fallbackPath={authFallbackForNext(nextPath)}
      supabaseConfig={getSupabasePublicConfig()}
    />
  );
}
