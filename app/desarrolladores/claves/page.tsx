import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeveloperApiKeyManager } from '@/components/DeveloperApiKeyManager';
import { SignOutButton } from '@/components/voluntarios/SignOutButton';
import { getLocale } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Mis claves de API · Respuesta VE',
  alternates: { canonical: '/desarrolladores/claves' },
};

const STR = {
  es: {
    heading: 'Mis claves de API',
    desc: 'Estas claves son para integraciones servidor-a-servidor. Puedes enviar datos para revision, consultar coincidencias y sincronizar registros procesados. La clave se muestra una sola vez y solo se guarda su hash.',
    signedInAs: 'Sesion activa',
    docs: 'Ver documentacion',
    unavailable: 'La base de datos aun no esta conectada en este entorno.',
  },
  en: {
    heading: 'My API keys',
    desc: 'These keys are for server-to-server integrations. You can submit data for review, check matches, and sync processed records. The key is shown once and only its hash is stored.',
    signedInAs: 'Signed in',
    docs: 'View documentation',
    unavailable: 'The database is not yet connected in this environment.',
  },
} as const;

export default async function DeveloperKeysPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const sb = await getSupabaseServer();

  if (!sb) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {s.unavailable}
        </p>
      </div>
    );
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/desarrolladores/acceder');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.desc}</p>
          <p className="mt-2 text-xs text-zinc-500">{s.signedInAs}: {user.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <Link href="/desarrolladores" className="font-medium text-red-600 hover:underline">{s.docs}</Link>
          <SignOutButton redirectTo="/desarrolladores" />
        </div>
      </div>

      <DeveloperApiKeyManager />
    </div>
  );
}
