import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { SkillsDesk } from '@/components/voluntarios/SkillsDesk';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios_intercambio');

const STR = {
  es: {
    heading: 'Mesa de habilidades',
    desc: 'Selecciona una solicitud abierta, verifica credenciales si aplica, y conecta al voluntario con quien lo necesita.',
    myProfile: 'Mi perfil',
  },
  en: {
    heading: 'Skills desk',
    desc: 'Select an open request, verify credentials if applicable, and connect the volunteer with whoever needs them.',
    myProfile: 'My profile',
  },
} as const;

export default async function IntercambioPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      {/* Sticky page header */}
      <div className="sticky top-0 z-20 -mx-4 flex items-start justify-between gap-4 bg-white/90 px-4 py-3 backdrop-blur dark:bg-zinc-950/90 sm:-mx-0 sm:static sm:mb-6 sm:bg-transparent sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{s.heading}</h1>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400 hidden sm:block">
            {s.desc}
          </p>
        </div>
        <Link href="/voluntarios" className="shrink-0 text-xs text-zinc-500 underline">
          {s.myProfile}
        </Link>
      </div>
      {/* Extra top padding on mobile to clear the sticky header */}
      <div className="mt-16 sm:mt-0">
        <SkillsDesk />
      </div>
    </div>
  );
}
