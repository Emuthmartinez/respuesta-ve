import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import { SKILL_LABEL } from '@/lib/skills';
import { URGENCY_COLOR, URGENCY_LABEL } from '@/lib/responder';
import { SAFETY_COPY } from '@/lib/safety-copy';

export const metadata: Metadata = { title: 'Intercambio de ayuda — Respuesta VE' };

interface Offer {
  id: string; skill_category: string; skill_detail: string | null;
  languages: string[] | null; estado: string | null; is_high_stakes: boolean; credential_verified: boolean;
}
interface Need {
  id: string; skill_needed: string; urgency: string; estado: string | null; municipio: string | null;
  description: string | null; has_minor_children: boolean;
}

export default async function IntercambioPage() {
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
      <h1 className="text-2xl font-bold tracking-tight">Intercambio de ayuda</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Conectamos a quienes pueden ayudar con quienes lo necesitan. El contacto
        es <strong>privado y mediado por un coordinador</strong>.
      </p>
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        {SAFETY_COPY.skills}
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/intercambio/necesitar" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Necesito ayuda
        </Link>
        <Link href="/intercambio/ofrecer" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20">
          Ofrezco ayuda
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Voluntarios disponibles ({offers.length})</h2>
          {offers.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay voluntarios publicados.</p>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{SKILL_LABEL[o.skill_category] ?? o.skill_category}</span>
                    {o.is_high_stakes && o.credential_verified && (
                      <span className="text-[11px] text-green-600">✓ credencial verificada</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">{o.estado ?? 'Ubicación no indicada'}</div>
                  {o.skill_detail && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{o.skill_detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Necesidades abiertas ({needs.length})</h2>
          {needs.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay necesidades abiertas ahora.</p>
          ) : (
            <div className="space-y-2">
              {needs.map((n) => (
                <div key={n.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{SKILL_LABEL[n.skill_needed] ?? n.skill_needed}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: URGENCY_COLOR[n.urgency] ?? '#777' }}>
                      {URGENCY_LABEL[n.urgency] ?? n.urgency}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{[n.municipio, n.estado].filter(Boolean).join(', ') || 'Ubicación no indicada'}</div>
                  {n.has_minor_children && <div className="mt-1 text-xs font-semibold text-red-600">Familia con menores de edad</div>}
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
