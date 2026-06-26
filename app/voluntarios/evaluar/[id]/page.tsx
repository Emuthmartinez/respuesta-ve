import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { AssessmentForm } from '@/components/voluntarios/AssessmentForm';
import { Disclaimer } from '@/components/Disclaimer';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios_evaluar');

const STR = {
  es: {
    heading: 'Evaluación de estructura (ATC-20)',
    desc: 'Tu dictamen actualiza el cartel del edificio en el mapa. No sustituye una evaluación oficial.',
  },
  en: {
    heading: 'Structural assessment (ATC-20)',
    desc: 'Your verdict updates the building placard on the map. It does not replace an official assessment.',
  },
} as const;

export default async function EvaluarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ req?: string }>;
}) {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');

  const { id } = await params;
  const { req } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.desc}
      </p>
      <Disclaimer className="mt-3" />
      <AssessmentForm uid={user.id} buildingId={id} requestId={req ?? null} />
    </div>
  );
}
