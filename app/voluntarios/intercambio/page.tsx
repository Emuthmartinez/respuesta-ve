import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { SkillsDesk } from '@/components/voluntarios/SkillsDesk';

export const metadata: Metadata = { title: 'Mesa de habilidades — Respuesta VE' };

export default async function IntercambioPage() {
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mesa de habilidades</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Selecciona una solicitud abierta, verifica credenciales si aplica, y conecta al
            voluntario con quien lo necesita.
          </p>
        </div>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          Mi perfil
        </Link>
      </div>
      <SkillsDesk />
    </div>
  );
}
