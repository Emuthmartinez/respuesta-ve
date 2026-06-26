import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { OrgPublic, CenterPublic } from '@/lib/orgs';
import { EMERGENCY_NUMBERS } from '@/lib/safety-copy';
import NearestCenters from '@/components/NearestCenters';
import { t, tr } from '@/lib/i18n';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('recursos');

// Org categories surfaced as resource lists on the in-country hub. Family
// search has its own card (→ /personas); collection centers have their own
// section sourced from donation_centers, so neither is listed here.
const RESOURCE_CATEGORIES = ['medical', 'rescue', 'mental_health', 'news_info'];

export default async function RecursosPage() {
  const locale = await getLocale();
  const d = t(locale).recursos;

  const sb = await getSupabaseServer();
  let orgs: OrgPublic[] = [];
  let veCenters: CenterPublic[] = [];
  if (sb) {
    const [o, c] = await Promise.all([
      sb.from('organizations_public').select('*').in('category', RESOURCE_CATEGORIES),
      sb.from('donation_centers_public').select('*').eq('country_code', 'VE').limit(100),
    ]);
    orgs = (o.data ?? []) as OrgPublic[];
    veCenters = (c.data ?? []) as CenterPublic[];
  }
  const byCat = (cat: string) => orgs.filter((o) => o.category === cat);

  const Section = ({ title, items, note }: { title: string; items: OrgPublic[]; note?: string }) =>
    items.length === 0 ? null : (
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
        <div className="mt-3 space-y-2">
          {items.map((o) => (
            <a key={o.id} href={o.website_url ?? '#'} target="_blank" rel="noreferrer"
              className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="font-medium">{o.name} →</div>
              {o.description && <div className="text-sm text-zinc-500">{o.description}</div>}
            </a>
          ))}
        </div>
      </section>
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {d.subtext}
      </p>

      {/* Emergency phone lines first — the most time-critical resource */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">{d.emergency_heading}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EMERGENCY_NUMBERS.map((n) => (
            <a key={n.label} href={`tel:${n.tel}`}
              className="rounded-lg border border-black/10 p-3 text-center hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="text-xl font-bold">{n.label}</div>
              <div className="text-xs text-zinc-500">{tr(n.note, locale)}</div>
            </a>
          ))}
        </div>
      </section>

      {/* Find your family → canonical missing-persons hub */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.family_heading}</h2>
        <Link href="/personas"
          className="mt-3 block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
          <div className="font-medium">{d.family_link}</div>
          <div className="text-sm text-zinc-500">{d.family_sub}</div>
        </Link>
      </section>

      {/* Collection / help centers physically in Venezuela */}
      {veCenters.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{d.centers_heading}</h2>
          <p className="mt-1 text-xs text-zinc-500">{d.centers_note}</p>
          <div className="mt-3">
            <NearestCenters centers={veCenters} />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.first_aid_heading}</h2>
        <Link href="/primeros-auxilios"
          className="mt-3 block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
          <div className="font-medium">{d.first_aid_link}</div>
          <div className="text-sm text-zinc-500">{d.first_aid_sub}</div>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.structural}</h2>
        <Link href="/solicitar-inspeccion"
          className="mt-3 block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
          <div className="font-medium">{d.structural_link}</div>
          <div className="text-sm text-zinc-500">{d.structural_sub}</div>
        </Link>
      </section>

      <Section title={d.medical_rescue} items={[...byCat('medical'), ...byCat('rescue')]} />
      <Section
        title={d.mental_health}
        items={byCat('mental_health')}
        note={d.mental_health_note}
      />
      <Section title={d.news} items={byCat('news_info')} />

      <p className="mt-8 text-xs text-zinc-500">
        {d.footer_missing}{' '}
        <span className="text-zinc-400">{d.footer_soon}</span>{' '}
        {d.footer_verified}
      </p>
    </div>
  );
}
