import { redirect } from 'next/navigation';
import { AccountAccessForm } from '@/components/AccountAccessForm';
import { getSupabasePublicConfig, getSupabaseServer } from '@/lib/supabase/server';

export default async function AccederPage() {
  const sb = await getSupabaseServer();
  if (sb) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) redirect('/voluntarios');
  }

  return (
    <AccountAccessForm
      variant="volunteer"
      nextPath="/voluntarios"
      backHref="/"
      supabaseConfig={getSupabasePublicConfig()}
    />
  );
}
