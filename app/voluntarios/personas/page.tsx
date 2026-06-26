import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { getLocale } from '@/lib/i18n-server';
import { MissingDedupDesk } from '@/components/voluntarios/MissingDedupDesk';

const STR = {
  es: {
    heading: 'Personas: deduplicación',
    myProfile: 'Mi perfil',
    desc: 'Revisa los grupos de “posible misma persona”. Fusionar oculta los duplicados detrás de un registro principal (reversible y auditado); separar deshace una agrupación equivocada. Nunca se borra un registro.',
  },
  en: {
    heading: 'People: deduplication',
    myProfile: 'My profile',
    desc: 'Review “possibly the same person” groups. Merge hides duplicates behind one main record (reversible and audited); split undoes a wrong grouping. No record is ever deleted.',
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
