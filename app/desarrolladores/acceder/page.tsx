import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountAccessForm } from '@/components/AccountAccessForm';
import { getSupabasePublicConfig, getSupabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Cuenta de desarrollador · Respuesta VE',
  alternates: { canonical: '/desarrolladores/acceder' },
};

export default async function DeveloperAccessPage() {
  const sb = await getSupabaseServer();
  if (sb) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) redirect('/desarrolladores/claves');
  }

  return (
    <AccountAccessForm
      variant="developer"
      nextPath="/desarrolladores/claves"
      backHref="/desarrolladores"
      supabaseConfig={getSupabasePublicConfig()}
    />
  );
}
