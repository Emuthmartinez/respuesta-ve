import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { InspectionQueue } from '@/components/voluntarios/InspectionQueue';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = { title: 'Cola de inspección — Respuesta VE' };

export default async function ColaPage() {
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');

  const isCoordinator = responder.is_coordinator || responder.tier === 'senior';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Cola de inspección</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          Mi perfil
        </Link>
      </div>
      <Disclaimer className="mb-4" />
      <InspectionQueue uid={user.id} isCoordinator={isCoordinator} />
    </div>
  );
}
