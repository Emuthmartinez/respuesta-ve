import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { getLocale } from '@/lib/i18n-server';
import { MissingDedupDesk } from '@/components/voluntarios/MissingDedupDesk';

const STR = {
  es: {
    heading: 'Personas: deduplicación',
    myProfile: 'Mi perfil',
    desc: 'Revisa calidad de ingesta, grupos de “posible misma persona” y conflictos. Los registros sospechosos no aparecen públicamente hasta que se aceptan; fusionar duplicados es reversible y auditado.',
  },
  en: {
    heading: 'People: deduplication',
    myProfile: 'My profile',
    desc: 'Review intake quality, “possibly the same person” groups, and conflicts. Suspicious records stay off the public site until accepted; duplicate merges are reversible and audited.',
  },
} as const;

export default async function PersonasDedupPage() {
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
      <MissingDedupDesk />
    </div>
  );
}
