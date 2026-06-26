import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { OrgPublic } from '@/lib/orgs';
import { EMERGENCY_NUMBERS } from '@/lib/safety-copy';
import { t, tr } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

export const metadata: Metadata = { title: 'Recursos — Respuesta VE' };

const RESOURCE_CATEGORIES = ['find_people', 'mental_health', 'news_info', 'medical', 'rescue'];

export default async function RecursosPage() {
  const locale = await getLocale();
  const d = t(locale).recursos;

  const sb = await getSupabaseServer();
  let orgs: OrgPublic[] = [];
  if (sb) {
    const { data } = await sb
      .from('organizations_public')
      .select('*')
      .in('category', RESOURCE_CATEGORIES);
    orgs = (data ?? []) as OrgPublic[];
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.first_aid_heading}</h2>
        <Link href="/primeros-auxilios"
          className="mt-3 block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
          <div className="font-medium">{d.first_aid_link}</div>
          <div className="text-sm text-zinc-500">{d.first_aid_sub}</div>
        </Link>
      </section>

      <Section title={d.find_people} items={byCat('find_people')} />
      <Section
        title={d.mental_health}
        items={byCat('mental_health')}
        note={d.mental_health_note}
      />

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.structural}</h2>
        <Link href="/solicitar-inspeccion"
          className="mt-3 block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
          <div className="font-medium">{d.structural_link}</div>
          <div className="text-sm text-zinc-500">{d.structural_sub}</div>
        </Link>
      </section>

      <Section title={d.medical_rescue} items={[...byCat('medical'), ...byCat('rescue')]} />
      <Section title={d.news} items={byCat('news_info')} />

      <p className="mt-8 text-xs text-zinc-500">
        {d.footer_missing}{' '}
        <span className="text-zinc-400">{d.footer_soon}</span>{' '}
        {d.footer_verified}
      </p>
    </div>
  );
}
