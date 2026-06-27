'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { SupabasePublicConfig } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: { signOut: 'Cerrar sesion', signingOut: 'Cerrando...' },
  en: { signOut: 'Sign out', signingOut: 'Signing out...' },
} as const;

export function SignOutButton({
  redirectTo = '/voluntarios',
  supabaseConfig,
}: {
  redirectTo?: string;
  supabaseConfig?: SupabasePublicConfig | null;
}) {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;

    const sb = getSupabaseBrowser(supabaseConfig);
    setBusy(true);
    if (sb) {
      const { error } = await sb.auth.signOut();
      if (error) {
        console.error('signOut error:', error);
        setBusy(false);
        return;
      }
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-60 dark:hover:text-zinc-200"
    >
      {busy ? s.signingOut : s.signOut}
    </button>
  );
}
