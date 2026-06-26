import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import { skillLabel } from '@/lib/skills';
import { URGENCY_COLOR, urgencyLabel } from '@/lib/responder';
import { safetyCopy as getSafetyCopy } from '@/lib/safety-copy';
import { getLocale } from '@/lib/i18n-server';

export const metadata: Metadata = { title: 'Intercambio de ayuda — Respuesta VE' };

const STR = {
  es: {
    heading: 'Intercambio de ayuda',
    subtext_pre: 'Conectamos a quienes pueden ayudar con quienes lo necesitan. El contacto es',
    subtext_strong: 'privado y mediado por un coordinador',
    subtext_post: '.',
    need_help: 'Necesito ayuda',
    offer_help: 'Ofrezco ayuda',
    volunteers_heading: (n: number) => `Voluntarios disponibles (${n})`,
    volunteers_empty: 'Aún no hay voluntarios publicados.',
    needs_heading: (n: number) => `Necesidades abiertas (${n})`,
    needs_empty: 'No hay necesidades abiertas ahora.',
    credential_verified: '✓ credencial verificada',
    location_unknown: 'Ubicación no indicada',
    has_minors: 'Familia con menores de edad',
  },
  en: {
    heading: 'Help exchange',
    subtext_pre: 'We connect those who can help with those who need it. Contact is',
    subtext_strong: 'private and mediated by a coordinator',
    subtext_post: '.',
    need_help: 'I need help',
    offer_help: "I'm offering help",
    volunteers_heading: (n: number) => `Available volunteers (${n})`,
    volunteers_empty: 'No volunteers listed yet.',
    needs_heading: (n: number) => `Open needs (${n})`,
    needs_empty: 'No open needs right now.',
    credential_verified: '✓ credential verified',
    location_unknown: 'Location not specified',
    has_minors: 'Family with minors',
  },
} as const;

interface Offer {
  id: string; skill_category: string; skill_detail: string | null;
  languages: string[] | null; estado: string | null; is_high_stakes: boolean; credential_verified: boolean;
}
interface Need {
  id: string; skill_needed: string; urgency: string; estado: string | null; municipio: string | null;
  description: string | null; has_minor_children: boolean;
}

export default async function IntercambioPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const sc = getSafetyCopy(locale);

  const sb = await getSupabaseServer();
  let offers: Offer[] = [];
  let needs: Need[] = [];
  if (sb) {
    const [o, n] = await Promise.all([
      sb.from('skill_offers_public').select('*').limit(100),
      sb.from('help_requests_public').select('*').limit(100),
    ]);
    offers = (o.data ?? []) as Offer[];
    needs = (n.data ?? []) as Need[];
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext_pre} <strong>{s.subtext_strong}</strong>{s.subtext_post}
      </p>
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        {sc.skills}
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/intercambio/necesitar" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          {s.need_help}
        </Link>
        <Link href="/intercambio/ofrecer" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20">
          {s.offer_help}
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{s.volunteers_heading(offers.length)}</h2>
          {offers.length === 0 ? (
            <p className="text-sm text-zinc-500">{s.volunteers_empty}</p>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{skillLabel(o.skill_category, locale)}</span>
                    {o.is_high_stakes && o.credential_verified && (
                      <span className="text-[11px] text-green-600">{s.credential_verified}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">{o.estado ?? s.location_unknown}</div>
                  {o.skill_detail && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{o.skill_detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{s.needs_heading(needs.length)}</h2>
          {needs.length === 0 ? (
            <p className="text-sm text-zinc-500">{s.needs_empty}</p>
          ) : (
            <div className="space-y-2">
              {needs.map((n) => (
                <div key={n.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{skillLabel(n.skill_needed, locale)}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: URGENCY_COLOR[n.urgency] ?? '#777' }}>
                      {urgencyLabel(n.urgency, locale)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{[n.municipio, n.estado].filter(Boolean).join(', ') || s.location_unknown}</div>
                  {n.has_minor_children && <div className="mt-1 text-xs font-semibold text-red-600">{s.has_minors}</div>}
                  {n.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{n.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
