import { redirect } from 'next/navigation';
import { AccountAccessForm } from '@/components/AccountAccessForm';
import { normalizeAuthNext } from '@/lib/auth-redirect';
import { getSupabasePublicConfig, getSupabaseServer } from '@/lib/supabase/server';

export default async function AccederPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = normalizeAuthNext(next);

  const sb = await getSupabaseServer();
  if (sb) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) redirect(nextPath);
  }

  return (
    <AccountAccessForm
      variant="volunteer"
      nextPath={nextPath}
      backHref="/"
      supabaseConfig={getSupabasePublicConfig()}
    />
  );
}
