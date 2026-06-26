import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { getLocale } from '@/lib/i18n-server';
import { ApiKeyManager } from '@/components/voluntarios/ApiKeyManager';

const STR = {
  es: {
    heading: 'Claves de API',
    myProfile: 'Mi perfil',
    desc: 'Emite y revoca claves para que otras plataformas y agentes usen la API de deduplicación. La clave se muestra una sola vez; guárdala bien. El motor solo almacena su hash.',
    docs: 'Ver documentación de la API →',
  },
  en: {
    heading: 'API keys',
    myProfile: 'My profile',
    desc: 'Issue and revoke keys for other platforms and agents to use the deduplication API. The key is shown only once — store it safely. The engine stores only its hash.',
    docs: 'View API documentation →',
  },
} as const;

export default async function ApiKeysPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{s.heading}</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">{s.myProfile}</Link>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{s.desc}</p>
      <a href="/desarrolladores" className="mt-1 inline-block text-sm font-medium text-red-600 hover:underline">{s.docs}</a>
      <ApiKeyManager />
    </div>
  );
}
