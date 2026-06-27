import { AccountAccessForm } from '@/components/AccountAccessForm';
import { getSupabasePublicConfig } from '@/lib/supabase/server';

export default function AccederPage() {
  return (
    <AccountAccessForm
      variant="volunteer"
      nextPath="/voluntarios"
      backHref="/"
      supabaseConfig={getSupabasePublicConfig()}
    />
  );
}
