import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified, signInPath } from '@/lib/auth';
import { InspectionQueue } from '@/components/voluntarios/InspectionQueue';
import { Disclaimer } from '@/components/Disclaimer';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios_cola');

const STR = {
  es: {
    heading: 'Cola de inspección',
    myProfile: 'Mi perfil',
  },
  en: {
    heading: 'Inspection queue',
    myProfile: 'My profile',
  },
} as const;

export default async function ColaPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect(signInPath('/voluntarios/cola'));
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');

  const isCoordinator = responder.is_coordinator || responder.tier === 'senior';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          {s.myProfile}
        </Link>
      </div>
      <Disclaimer className="mb-4" />
      <InspectionQueue uid={user.id} isCoordinator={isCoordinator} />
    </div>
  );
}
