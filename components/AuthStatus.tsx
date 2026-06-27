'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { SupabasePublicConfig } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    signIn: 'Acceder',
    keys: 'Mis claves',
    signOut: 'Salir',
    signingOut: 'Saliendo...',
  },
  en: {
    signIn: 'Sign in',
    keys: 'My keys',
    signOut: 'Sign out',
    signingOut: 'Signing out...',
  },
} as const;

interface AuthStatusProps {
  initialEmail?: string | null;
  mode?: 'desktop' | 'mobile';
  supabaseConfig?: SupabasePublicConfig | null;
}

export function AuthStatus({ initialEmail = null, mode = 'desktop', supabaseConfig }: AuthStatusProps) {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const mobile = mode === 'mobile';

  useEffect(() => {
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) return;

    let mounted = true;
    // getSession() reads the stored session without a server round-trip and
    // returns null cleanly when signed out — unlike getUser(), which raises
    // AuthSessionMissingError for every logged-out visitor. The validated email
    // for the first paint already comes from the server via initialEmail.
    void sb.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('auth session lookup error:', error);
      setEmail(data.session?.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user.email ?? null);
      if (event !== 'INITIAL_SESSION') router.refresh();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabaseConfig]);

  async function signOut() {
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
    setEmail(null);
    router.push('/');
    router.refresh();
  }

  const linkClass = mobile
    ? 'block rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
    : 'rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30';
  const neutralClass = mobile
    ? 'block rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10'
    : 'rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white';
  const buttonClass = `${neutralClass} disabled:opacity-60`;

  if (!email) {
    return (
      <Link href="/desarrolladores/acceder" className={linkClass}>
        {s.signIn}
      </Link>
    );
  }

  if (mobile) {
    return (
      <div className="space-y-1">
        <div className="truncate px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300" title={email}>
          {email}
        </div>
        <Link href="/desarrolladores/claves" className={neutralClass}>
          {s.keys}
        </Link>
        <button type="button" onClick={signOut} disabled={busy} className={`${buttonClass} w-full text-left`}>
          {busy ? s.signingOut : s.signOut}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link href="/desarrolladores/claves" className={neutralClass}>
        {s.keys}
      </Link>
      <span
        className="hidden max-w-40 truncate rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 xl:inline dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900"
        title={email}
      >
        {email}
      </span>
      <button type="button" onClick={signOut} disabled={busy} className={buttonClass}>
        {busy ? s.signingOut : s.signOut}
      </button>
    </div>
  );
}
