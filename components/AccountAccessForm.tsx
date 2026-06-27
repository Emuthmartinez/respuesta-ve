'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { SupabasePublicConfig } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

type AccessVariant = 'volunteer' | 'developer';

const STR = {
  es: {
    volunteer: {
      heading: 'Acceso para voluntarios',
      desc: 'Inicia sesion o crea una cuenta. Solo voluntarios y responders usan esta seccion; para reportar danos no necesitas cuenta.',
      back: 'Volver al mapa',
    },
    developer: {
      heading: 'Cuenta de desarrollador',
      desc: 'Crea una cuenta o inicia sesion para emitir una clave de API. La clave queda asociada a tu cuenta para poder limitar, pausar o revocar el acceso si hace falta.',
      back: 'Volver a la API',
    },
    google: 'Continuar con Google',
    orEmail: 'o con tu correo',
    email: 'Correo',
    password: 'Contrasena',
    signin: 'Iniciar sesion',
    signup: 'Crear cuenta',
    toSignup: 'No tienes cuenta? Crear una',
    toSignin: 'Ya tienes cuenta? Inicia sesion',
    working: 'Un momento...',
    magic: 'Prefieres un enlace por correo? Enviamelo',
    magicSent: (e: string) => (
      <>Te enviamos un enlace a <strong>{e}</strong>. Abrelo para entrar.</>
    ),
    confirmSent: (e: string) => (
      <>Cuenta creada. Revisa <strong>{e}</strong> para confirmarla, luego inicia sesion.</>
    ),
    dbError: 'La base de datos aun no esta conectada.',
    generic: 'No se pudo completar. Intentalo de nuevo.',
    pwShort: 'La contrasena debe tener al menos 6 caracteres.',
    emailNeeded: 'Escribe tu correo primero.',
  },
  en: {
    volunteer: {
      heading: 'Volunteer sign-in',
      desc: 'Sign in or create an account. Only volunteers and responders use this section; no account is needed to report damage.',
      back: 'Back to the map',
    },
    developer: {
      heading: 'Developer account',
      desc: 'Create an account or sign in to issue an API key. The key stays tied to your account so access can be limited, paused, or revoked when needed.',
      back: 'Back to the API',
    },
    google: 'Continue with Google',
    orEmail: 'or with your email',
    email: 'Email',
    password: 'Password',
    signin: 'Sign in',
    signup: 'Create account',
    toSignup: 'No account? Create one',
    toSignin: 'Already have an account? Sign in',
    working: 'One moment...',
    magic: 'Prefer an email link? Send me one',
    magicSent: (e: string) => (
      <>We sent a link to <strong>{e}</strong>. Open it to sign in.</>
    ),
    confirmSent: (e: string) => (
      <>Account created. Check <strong>{e}</strong> to confirm it, then sign in.</>
    ),
    dbError: 'The database is not yet connected.',
    generic: 'Could not complete. Please try again.',
    pwShort: 'Password must be at least 6 characters.',
    emailNeeded: 'Enter your email first.',
  },
} as const;

interface AccountAccessFormProps {
  variant: AccessVariant;
  nextPath: string;
  backHref: string;
  supabaseConfig?: SupabasePublicConfig | null;
}

export function AccountAccessForm({ variant, nextPath, backHref, supabaseConfig }: AccountAccessFormProps) {
  const locale = useLocale();
  const s = STR[locale];
  const page = s[variant];

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo = () => `${window.location.origin}/auth/finish?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) return;

    let mounted = true;
    void sb.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        console.error('access session check error:', error);
        return;
      }
      if (!data.session) return;

      const { data: userData, error: userError } = await sb.auth.getUser();
      if (!mounted) return;
      if (userError) {
        console.error('access user lookup error:', userError);
        return;
      }
      if (userData.user) window.location.replace(nextPath);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION' && session?.user) window.location.replace(nextPath);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [nextPath, supabaseConfig]);

  async function withGoogle() {
    setErr('');
    setNotice(null);
    setLoading(true);
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      setErr(s.dbError);
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      console.error('google oauth error:', error);
      setErr(error.message || s.generic);
      setLoading(false);
    }
  }

  async function withPassword(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    setNotice(null);
    if (password.length < 6) {
      setErr(s.pwShort);
      return;
    }
    setLoading(true);
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      setErr(s.dbError);
      setLoading(false);
      return;
    }
    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      setLoading(false);
      if (error) {
        console.error('signUp error:', error);
        setErr(error.message || s.generic);
        return;
      }
      if (data.session) window.location.href = nextPath;
      else setNotice(s.confirmSent(email));
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        console.error('signIn error:', error);
        setErr(error.message || s.generic);
        return;
      }
      window.location.href = nextPath;
    }
  }

  async function withMagicLink() {
    setErr('');
    setNotice(null);
    if (!email) {
      setErr(s.emailNeeded);
      return;
    }
    setLoading(true);
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      setErr(s.dbError);
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(false);
    if (error) {
      console.error('magic link error:', error);
      setErr(error.message || s.generic);
    } else setNotice(s.magicSent(email));
  }

  const field =
    'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{page.heading}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{page.desc}</p>

      {notice && (
        <div className="mt-6 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          {notice}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <button
          onClick={withGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          {s.google}
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          {s.orEmail}
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <form onSubmit={withPassword} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={s.email}
            autoComplete="email"
            className={field}
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={s.password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={field}
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? s.working : mode === 'signup' ? s.signup : s.signin}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setErr('');
            setNotice(null);
          }}
          className="text-xs text-zinc-500 underline"
        >
          {mode === 'signup' ? s.toSignin : s.toSignup}
        </button>

        <div>
          <button onClick={withMagicLink} disabled={loading} className="text-xs text-zinc-400 underline disabled:opacity-60">
            {s.magic}
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        <Link href={backHref} className="underline">{page.back}</Link>
      </p>
    </div>
  );
}
