import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import { ORG_CATEGORY_LABEL, ORG_SCOPE_LABEL } from '@/lib/orgs';
import type { OrgPublic, CenterPublic } from '@/lib/orgs';
import { SAFETY_COPY } from '@/lib/safety-copy';
import NearestCenters from '@/components/NearestCenters';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

export const metadata: Metadata = {
  title: 'Ayuda desde el exterior — Respuesta VE',
  description: 'Organizaciones verificadas, centros de acopio y plataformas para buscar personas tras el terremoto en Venezuela.',
};

const PEOPLE_CATEGORIES = new Set(['find_people', 'news_info']);
const isDonorOrg = (o: OrgPublic) => !PEOPLE_CATEGORIES.has(o.category);
const isPeopleOrg = (o: OrgPublic) => PEOPLE_CATEGORIES.has(o.category);

function orgCTA(
  o: OrgPublic,
  labels: { read: string; find: string; donate: string; campaign: string },
): { label: string; url: string } | null {
  if (isPeopleOrg(o)) {
    const url = o.website_url ?? o.donation_url;
    if (!url) return null;
    return { label: o.category === 'news_info' ? labels.read : labels.find, url };
  }
  if (o.donation_url) return { label: labels.donate, url: o.donation_url };
  if (o.website_url) return { label: labels.campaign, url: o.website_url };
  return null;
}

export default async function AfueraPage() {
  const locale = await getLocale();
  const d = t(locale);
  const da = d.afuera;

  const sb = await getSupabaseServer();
  let orgs: OrgPublic[] = [];
  let centers: CenterPublic[] = [];
  if (sb) {
    const [o, c] = await Promise.all([
      sb.from('organizations_public').select('*').order('name'),
      sb.from('donation_centers_public').select('*').limit(200),
    ]);
    orgs = (o.data ?? []) as OrgPublic[];
    centers = (c.data ?? []) as CenterPublic[];
  }
  const donorOrgs = orgs.filter(isDonorOrg);
  const peopleOrgs = orgs.filter(isPeopleOrg);

  const ctaLabels = {
    read: da.org_cta_read,
    find: da.org_cta_find,
    donate: da.org_cta_donate,
    campaign: da.org_cta_campaign,
  };

  const safetyCopy = locale === 'en' ? d.safety : {
    donation: SAFETY_COPY.donation,
    scamWarning: SAFETY_COPY.scamWarning,
    skills: SAFETY_COPY.skills,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{da.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            {da.subtext}
          </p>
        </div>
        <Link href="/" className="shrink-0 text-xs text-zinc-500 underline">{da.link_inside}</Link>
      </div>

      <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        <strong>{da.scam_heading}</strong> {safetyCopy.donation} {safetyCopy.scamWarning}{' '}
        {da.scam_verify_prefix}{' '}
        <a className="underline" href="https://www.charitynavigator.org" target="_blank" rel="noreferrer">Charity Navigator</a>{' '}
        {da.scam_verify_and}{' '}
        <a className="underline" href="https://give.org" target="_blank" rel="noreferrer">BBB Give.org</a>.
      </div>

      {/* 1 · Donar dinero / Donate money */}
      <section className="mt-10">
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="text-xl font-bold">{da.section1_title}</h2>
          <span className="text-xs text-zinc-400">{da.section1_count(donorOrgs.length)}</span>
        </div>
        <p className="mb-4 text-sm text-zinc-500">{da.section1_desc}</p>
        {donorOrgs.length === 0 ? (
          <p className="text-sm text-zinc-500">{da.section1_empty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {donorOrgs.map((o) => {
              const cta = orgCTA(o, ctaLabels);
              return (
                <div key={o.id} className="flex flex-col rounded-lg border border-black/10 p-4 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {ORG_CATEGORY_LABEL[o.category] ?? o.category}
                    </span>
                    {o.verified && <span className="text-[11px] text-green-600">{da.org_verified}</span>}
                  </div>
                  <div className="mt-2 font-medium">{o.name}</div>
                  <div className="text-xs text-zinc-500">{ORG_SCOPE_LABEL[o.scope] ?? o.scope}</div>
                  {o.description && <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{o.description}</p>}
                  {cta && (
                    <div className="mt-3">
                      <a href={cta.url} target="_blank" rel="noreferrer"
                        className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">{cta.label}</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2 · Donar en persona / Donate in person */}
      <section className="mt-12">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold">{da.section2_title}</h2>
            <span className="text-xs text-zinc-400">{da.section2_count(centers.length)}</span>
          </div>
          <Link href="/afuera/agregar-centro" className="shrink-0 text-xs font-medium text-amber-600 hover:underline">{da.section2_add}</Link>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          {da.section2_desc}
        </p>
        <NearestCenters centers={centers} />
      </section>

      {/* 3 · Buscar / reportar personas */}
      <section className="mt-12">
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="text-xl font-bold">{da.section3_title}</h2>
          <span className="text-xs text-zinc-400">{da.section3_count(peopleOrgs.length)}</span>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          {da.section3_desc}
        </p>
        {peopleOrgs.length === 0 ? (
          <p className="text-sm text-zinc-500">{da.section3_empty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {peopleOrgs.map((o) => {
              const cta = orgCTA(o, ctaLabels);
              return (
                <div key={o.id} className="flex flex-col rounded-lg border border-black/10 bg-blue-50/40 p-4 dark:border-white/10 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      {ORG_CATEGORY_LABEL[o.category] ?? o.category}
                    </span>
                    {o.verified && <span className="text-[11px] text-green-600">{da.org_verified}</span>}
                  </div>
                  <div className="mt-2 font-medium">{o.name}</div>
                  {o.description && <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{o.description}</p>}
                  {cta && (
                    <div className="mt-3">
                      <a href={cta.url} target="_blank" rel="noreferrer"
                        className="rounded-full border border-blue-300 bg-white px-4 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-transparent dark:text-blue-300">{cta.label}</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">{da.other_heading}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {da.other.map(([title, desc]) => (
            <div key={title} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
