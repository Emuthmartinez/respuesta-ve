import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified, signInPath } from '@/lib/auth';
import { ModerationList } from '@/components/voluntarios/ModerationList';
import { RetractionQueue, type BuildingRetractionRow, type InspectionCancellationRow } from '@/components/voluntarios/RetractionQueue';
import { getLocale, metaFor } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios_moderacion');

const STR = {
  es: {
    heading: 'Moderación de reportes',
    myProfile: 'Mi perfil',
    desc: 'Los reportes aprobados aparecen en el mapa público. Aprueba los legítimos y rechaza spam o reportes abusivos.',
    sectionReports: 'Reportes de edificios pendientes',
    sectionRetractions: 'Colas de retiro y cancelación',
  },
  en: {
    heading: 'Report moderation',
    myProfile: 'My profile',
    desc: 'Approved reports appear on the public map. Approve legitimate ones and reject spam or abusive reports.',
    sectionReports: 'Pending building reports',
    sectionRetractions: 'Retraction & cancellation queues',
  },
} as const;

export default async function ModeracionPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();
  if (!user) redirect(signInPath('/voluntarios/moderacion'));
  if (!responder || !isActiveVerified(responder)) redirect('/voluntarios');
  if (!(responder.is_coordinator || responder.tier === 'senior')) redirect('/voluntarios');

  // Fetch the two retraction queues server-side (coordinator RLS allows SELECT)
  const sb = await getSupabaseServer();
  let buildings: BuildingRetractionRow[] = [];
  let inspections: InspectionCancellationRow[] = [];

  if (sb) {
    const [bResult, iResult] = await Promise.all([
      sb
        .from('buildings')
        .select('id,estado,municipio,damage_level,people_status,retraction_requested_reason,retraction_requested_at')
        .not('retraction_requested_at', 'is', null)
        .order('retraction_requested_at', { ascending: true }),
      sb
        .from('inspection_requests')
        .select('id,municipio,status,claimed_by,cancellation_requested_reason,cancellation_requested_at')
        .not('cancellation_requested_at', 'is', null)
        .order('cancellation_requested_at', { ascending: true }),
    ]);
    if (!bResult.error) buildings = (bResult.data ?? []) as BuildingRetractionRow[];
    if (!iResult.error) inspections = (iResult.data ?? []) as InspectionCancellationRow[];
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
        <Link href="/voluntarios" className="text-xs text-zinc-500 underline">
          {s.myProfile}
        </Link>
      </div>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {s.desc}
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {s.sectionReports}
        </h2>
        <ModerationList />
      </section>

      <hr className="mb-8 border-black/10 dark:border-white/10" />

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {s.sectionRetractions}
        </h2>
        <RetractionQueue buildings={buildings} inspections={inspections} />
      </section>
    </div>
  );
}
