import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { ModerationList } from '@/components/voluntarios/ModerationList';

export const metadata: Metadata = { title: 'Moderación — Respuesta VE' };

export default async function ModeracionPage() {
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Moderación de reportes</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          Mi perfil
        </Link>
      </div>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Los reportes aprobados aparecen en el mapa público. Aprueba los legítimos
        y rechaza spam o reportes abusivos.
      </p>
      <ModerationList />
    </div>
  );
}
