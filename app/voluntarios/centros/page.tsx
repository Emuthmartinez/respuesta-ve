import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified, signInPath } from '@/lib/auth';
import { DonationCenterQueue } from '@/components/voluntarios/DonationCenterQueue';
import { OrganizationQueue } from '@/components/voluntarios/OrganizationQueue';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios_centros');

const STR = {
  es: {
    heading: 'Aprobación de donaciones',
    myProfile: 'Mi perfil',
    centersHeading: 'Centros de acopio pendientes',
    centersDesc: 'Enviados por la comunidad. Verifica nombre, ciudad y contacto antes de aprobar. Rechazar marca como spam y no aparece en público.',
    orgsHeading: 'Organizaciones sugeridas',
    orgsDesc: 'Propuestas de usuarios. Promover activa la org y la muestra en /afuera. Rechazar la marca como inactiva y no aparece.',
  },
  en: {
    heading: 'Donation approval',
    myProfile: 'My profile',
    centersHeading: 'Pending collection centers',
    centersDesc: 'Submitted by the community. Verify name, city, and contact before approving. Rejecting marks as spam and hides it from the public.',
    orgsHeading: 'Suggested organizations',
    orgsDesc: 'Proposed by users. Promoting activates the org and shows it on /afuera. Rejecting marks it as inactive and hides it.',
  },
} as const;

export default async function CentrosPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect(signInPath('/voluntarios/centros'));
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-10 sm:py-8">
      {/* Sticky page header */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between bg-white/90 px-4 py-3 backdrop-blur dark:bg-zinc-950/90 sm:-mx-0 sm:static sm:bg-transparent sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{s.heading}</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          {s.myProfile}
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">{s.centersHeading}</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {s.centersDesc}
        </p>
        <DonationCenterQueue />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">{s.orgsHeading}</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {s.orgsDesc}
        </p>
        <OrganizationQueue />
      </section>
    </div>
  );
}
