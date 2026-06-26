import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { AssessmentForm } from '@/components/voluntarios/AssessmentForm';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = { title: 'Evaluación ATC-20 — Respuesta VE' };

export default async function EvaluarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ req?: string }>;
}) {
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');

  const { id } = await params;
  const { req } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Evaluación de estructura (ATC-20)</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tu dictamen actualiza el cartel del edificio en el mapa. No sustituye una
        evaluación oficial.
      </p>
      <Disclaimer className="mt-3" />
      <AssessmentForm uid={user.id} buildingId={id} requestId={req ?? null} />
    </div>
  );
}
