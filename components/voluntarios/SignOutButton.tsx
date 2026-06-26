'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
    router.push('/voluntarios');
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
    >
      Cerrar sesión
    </button>
  );
}
