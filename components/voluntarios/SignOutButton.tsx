'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: { signOut: 'Cerrar sesión' },
  en: { signOut: 'Sign out' },
} as const;

export function SignOutButton({ redirectTo = '/voluntarios' }: { redirectTo?: string }) {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  async function signOut() {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
    router.push(redirectTo);
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
    >
      {s.signOut}
    </button>
  );
}
