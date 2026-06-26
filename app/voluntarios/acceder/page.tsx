'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export default function AccederPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const sb = getSupabaseBrowser();
    if (!sb) {
      setErr('La base de datos aún no está conectada.');
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/voluntarios` },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Acceso para voluntarios</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Ingresa tu correo y te enviaremos un enlace de acceso. Solo voluntarios y
        responders usan esta sección — para reportar daños no necesitas cuenta.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          Revisa tu correo <strong>{email}</strong> y abre el enlace para continuar.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900"
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? 'Enviando…' : 'Enviar enlace de acceso'}
          </button>
        </form>
      )}

      <p className="mt-6 text-xs text-zinc-500">
        <Link href="/" className="underline">
          Volver al mapa
        </Link>
      </p>
    </div>
  );
}
