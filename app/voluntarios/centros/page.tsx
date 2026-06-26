import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { DonationCenterQueue } from '@/components/voluntarios/DonationCenterQueue';
import { OrganizationQueue } from '@/components/voluntarios/OrganizationQueue';

export const metadata: Metadata = { title: 'Aprobación de donaciones — Respuesta VE' };

export default async function CentrosPage() {
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Aprobación de donaciones</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          Mi perfil
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">Centros de acopio pendientes</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Enviados por la comunidad. Verifica nombre, ciudad y contacto antes de aprobar.
          Rechazar marca como spam y no aparece en público.
        </p>
        <DonationCenterQueue />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Organizaciones sugeridas</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Propuestas de usuarios. Promover activa la org y la muestra en /afuera.
          Rechazar la marca como inactiva y no aparece.
        </p>
        <OrganizationQueue />
      </section>
    </div>
  );
}
