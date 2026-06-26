import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { ResponderVerifyList } from '@/components/voluntarios/ResponderVerifyList';
import { getLocale } from '@/lib/i18n-server';

export const metadata: Metadata = { title: 'Verificación de responders — Respuesta VE' };

const STR = {
  es: {
    heading: 'Verificación de responders',
    myProfile: 'Mi perfil',
    desc: 'Revisa la credencial y la selfie antes de verificar. Verifica el número CIV en civ.net.ve cuando sea posible. Solo responders verificados ven ubicaciones precisas y atienden la cola de inspección.',
  },
  en: {
    heading: 'Responder verification',
    myProfile: 'My profile',
    desc: 'Review the credential and selfie before verifying. Check the CIV number at civ.net.ve when possible. Only verified responders see precise locations and handle the inspection queue.',
  },
} as const;

export default async function RespondersPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect('/voluntarios/acceder');
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          {s.myProfile}
        </Link>
      </div>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {s.desc}
      </p>
      <ResponderVerifyList />
    </div>
  );
}
