'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  REQUEST_STATUS_LABEL, URGENCY_LABEL, URGENCY_COLOR, NEEDS_LABEL,
  requestStatusLabel, urgencyLabel, needsLabel,
} from '@/lib/responder';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Cargando solicitudes…',
    tabTriage: (n: number) => `Por triar (${n})`,
    tabAvailable: (n: number) => `Disponibles (${n})`,
    tabMine: (n: number) => `Mis solicitudes (${n})`,
    noLocation: 'Ubicación sin detallar',
    peopleInside: '⚠ Personas dentro reportadas',
    sendToQueue: 'Enviar a la cola',
    noAvailable: 'No hay solicitudes disponibles ahora.',
    claim: 'Tomar esta solicitud',
    noMine: 'No tienes solicitudes asignadas.',
    contact: 'Contacto:',
    openMap: 'Abrir ubicación precisa en mapas',
    markArrival: 'Marqué llegada',
    submitAssessment: 'Emitir evaluación',
    release: 'Liberar',
    couldNotComplete: 'No se pudo completar — otra persona pudo haberla tomado.',
  },
  en: {
    loading: 'Loading requests…',
    tabTriage: (n: number) => `To triage (${n})`,
    tabAvailable: (n: number) => `Available (${n})`,
    tabMine: (n: number) => `My requests (${n})`,
    noLocation: 'Location not specified',
    peopleInside: '⚠ People inside reported',
    sendToQueue: 'Send to queue',
    noAvailable: 'No requests available right now.',
    claim: 'Claim this request',
    noMine: 'You have no assigned requests.',
    contact: 'Contact:',
    openMap: 'Open exact location in maps',
    markArrival: 'Mark arrival',
    submitAssessment: 'Submit assessment',
    release: 'Release',
    couldNotComplete: 'Could not complete — someone else may have claimed it.',
  },
} as const;

interface Req {
  id: string;
  building_id: string | null;
  needs_type: string;
  status: string;
  urgency: string;
  estado: string | null;
  municipio: string | null;
  address: string | null;
  description: string | null;
  requester_contact: string | null;
  contact_window: string | null;
  access_status: string | null;
  people_inside_at_submission: boolean;
  lat: number | null;
  lng: number | null;
  claimed_by: string | null;
  created_at: string;
}

const SELECT =
  'id,building_id,needs_type,status,urgency,estado,municipio,address,description,requester_contact,contact_window,access_status,people_inside_at_submission,lat,lng,claimed_by,created_at';

export function InspectionQueue({ uid, isCoordinator }: { uid: string; isCoordinator: boolean }) {
  const locale = useLocale();
  const s = STR[locale];
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from('inspection_requests')
      .select(SELECT)
      .in('status', ['submitted', 'triaged', 'claimed', 'in_progress'])
      .order('created_at', { ascending: true });
    if (!error) setReqs((data ?? []) as Req[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(fn: string, args: Record<string, unknown>) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data === false) setMsg(s.couldNotComplete);
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">{s.loading}</p>;

  const submitted = reqs.filter((r) => r.status === 'submitted');
  const available = reqs.filter((r) => r.status === 'triaged' && !r.claimed_by);
  const mine = reqs.filter((r) => r.claimed_by === uid && ['claimed', 'in_progress'].includes(r.status));

  const Card = ({ r, children }: { r: Req; children: React.ReactNode }) => (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: URGENCY_COLOR[r.urgency] ?? '#777' }}
        >
          {urgencyLabel(r.urgency, locale)}
        </span>
        <span className="text-xs text-zinc-500">{requestStatusLabel(r.status, locale)}</span>
      </div>
      <div className="mt-2 text-sm font-medium">{needsLabel(r.needs_type, locale)}</div>
      <div className="text-xs text-zinc-500">
        {[r.address, r.municipio, r.estado].filter(Boolean).join(', ') || s.noLocation}
      </div>
      {r.people_inside_at_submission && (
        <div className="mt-1 text-xs font-semibold text-red-600">{s.peopleInside}</div>
      )}
      {r.description && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{r.description}</p>}
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{msg}</p>}

      {isCoordinator && submitted.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{s.tabTriage(submitted.length)}</h2>
          <div className="space-y-3">
            {submitted.map((r) => (
              <Card key={r.id} r={r}>
                <button
                  onClick={() => call('triage_inspection_request', { request_id: r.id, p_urgency: null, p_tier: null })}
                  className="mt-3 rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-200 dark:text-zinc-900"
                >
                  {s.sendToQueue}
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{s.tabAvailable(available.length)}</h2>
        {available.length === 0 ? (
          <p className="text-sm text-zinc-500">{s.noAvailable}</p>
        ) : (
          <div className="space-y-3">
            {available.map((r) => (
              <Card key={r.id} r={r}>
                <button
                  onClick={() => call('claim_inspection_request', { request_id: r.id })}
                  className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  {s.claim}
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{s.tabMine(mine.length)}</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-zinc-500">{s.noMine}</p>
        ) : (
          <div className="space-y-3">
            {mine.map((r) => (
              <Card key={r.id} r={r}>
                <div className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {r.requester_contact && <div>{s.contact} <strong>{r.requester_contact}</strong> {r.contact_window && `(${r.contact_window})`}</div>}
                  {r.lat != null && r.lng != null && (
                    <a className="text-red-600 underline" target="_blank" rel="noreferrer"
                       href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}>
                      {s.openMap}
                    </a>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'claimed' && (
                    <button onClick={() => call('mark_inspection_arrived', { request_id: r.id })}
                      className="rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-200 dark:text-zinc-900">
                      {s.markArrival}
                    </button>
                  )}
                  {r.building_id && (
                    <Link href={`/voluntarios/evaluar/${r.building_id}?req=${r.id}`}
                      className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      {s.submitAssessment}
                    </Link>
                  )}
                  <button onClick={() => call('release_inspection_request', { request_id: r.id })}
                    className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20">
                    {s.release}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
