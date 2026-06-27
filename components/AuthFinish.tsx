'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { SupabasePublicConfig } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    heading: 'Terminando inicio de sesion',
    working: 'Estamos conectando tu cuenta de forma segura...',
    fallback: 'No pudimos completar el inicio de sesion. Te vamos a regresar para intentarlo otra vez.',
  },
  en: {
    heading: 'Finishing sign-in',
    working: 'We are connecting your account securely...',
    fallback: 'We could not complete sign-in. We will send you back to try again.',
  },
} as const;

interface AuthFinishProps {
  code?: string | null;
  error?: string | null;
  nextPath: string;
  fallbackPath: string;
  supabaseConfig?: SupabasePublicConfig | null;
}

function fallbackWithError(fallbackPath: string) {
  return `${fallbackPath}${fallbackPath.includes('?') ? '&' : '?'}error=auth`;
}

export function AuthFinish({ code, error, nextPath, fallbackPath, supabaseConfig }: AuthFinishProps) {
  const locale = useLocale();
  const s = STR[locale];
  const started = useRef(false);
  const [message, setMessage] = useState<string>(s.working);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fail = (reason: string, detail?: unknown) => {
      if (detail) console.error(reason, detail);
      else console.error(reason);
      setMessage(s.fallback);
      window.setTimeout(() => {
        window.location.replace(fallbackWithError(fallbackPath));
      }, 900);
    };

    if (error) {
      fail('auth provider returned an error:', error);
      return;
    }

    if (!code) {
      fail('auth finish missing code');
      return;
    }

    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      fail('auth finish missing Supabase browser config');
      return;
    }

    void sb.auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          fail('auth code exchange error:', exchangeError);
          return;
        }
        window.location.replace(nextPath);
      })
      .catch((exchangeError: unknown) => {
        fail('auth code exchange threw:', exchangeError);
      });
  }, [code, error, fallbackPath, nextPath, s.fallback, supabaseConfig]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{message}</p>
    </div>
  );
}
