'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DAMAGE_BY_VALUE, PEOPLE_BY_VALUE, type DamageLevel, type PeopleStatus } from '@/lib/taxonomy';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    // Buildings
    buildingsHeading: 'Retiros pendientes (rescate en curso)',
    buildingsEmpty: 'No hay retiros de edificios pendientes.',
    damage: 'Nivel de daño:',
    people: 'Estado de personas:',
    reason: 'Razón del retiro:',
    requestedAt: 'Solicitado:',
    confirm: 'Confirmar retiro',
    confirmWarning: 'ADVERTENCIA: Esto ocultará este reporte del mapa público. Solo hazlo si el rescate está completo y no hay personas en riesgo.',
    deny: 'Mantener reporte',
    confirmingBuilding: 'Procesando retiro…',
    denyingBuilding: 'Manteniendo reporte…',
    // Inspections
    inspectionsHeading: 'Cancelaciones de inspección pendientes',
    inspectionsEmpty: 'No hay cancelaciones de inspección pendientes.',
    municipio: 'Municipio:',
    status: 'Estado:',
    claimedBy: 'Inspector asignado:',
    cancelReason: 'Razón de cancelación:',
    confirmCancel: 'Confirmar cancelación',
    denyCancel: 'Mantener inspección',
    confirmingInspection: 'Procesando cancelación…',
    denyingInspection: 'Manteniendo inspección…',
    // Shared
    noReason: '(sin razón indicada)',
    errMsg: 'Error: ',
    confirmDialog: '¿Estás seguro? Esta acción es irreversible.',
  },
  en: {
    buildingsHeading: 'Pending retractions (rescue in progress)',
    buildingsEmpty: 'No pending building retractions.',
    damage: 'Damage level:',
    people: 'People status:',
    reason: 'Retraction reason:',
    requestedAt: 'Requested:',
    confirm: 'Confirm retraction',
    confirmWarning: 'WARNING: This will hide this report from the public map. Only do this if the rescue is complete and no people are at risk.',
    deny: 'Keep report',
    confirmingBuilding: 'Processing retraction…',
    denyingBuilding: 'Keeping report…',
    inspectionsHeading: 'Pending inspection cancellations',
    inspectionsEmpty: 'No pending inspection cancellations.',
    municipio: 'Municipality:',
    status: 'Status:',
    claimedBy: 'Assigned inspector:',
    cancelReason: 'Cancellation reason:',
    confirmCancel: 'Confirm cancellation',
    denyCancel: 'Keep inspection',
    confirmingInspection: 'Processing cancellation…',
    denyingInspection: 'Keeping inspection…',
    noReason: '(no reason provided)',
    errMsg: 'Error: ',
    confirmDialog: 'Are you sure? This action is irreversible.',
  },
} as const;

export interface BuildingRetractionRow {
  id: string;
  estado: string | null;
  municipio: string | null;
  damage_level: string;
  people_status: string;
  retraction_requested_reason: string | null;
  retraction_requested_at: string;
}

export interface InspectionCancellationRow {
  id: string;
  municipio: string | null;
  status: string;
  claimed_by: string | null;
  cancellation_requested_reason: string | null;
  cancellation_requested_at: string;
}

function BuildingCard({
  row,
  onDone,
}: {
  row: BuildingRetractionRow;
  onDone: () => void;
}) {
  const locale = useLocale();
  const s = STR[locale];
  const [acting, setActing] = useState<'confirm' | 'deny' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState('');

  const damageEntry = DAMAGE_BY_VALUE[row.damage_level as DamageLevel];
  const peopleEntry = PEOPLE_BY_VALUE[row.people_status as PeopleStatus];
  const isUrgent =
    row.people_status === 'confirmed_trapped' || row.people_status === 'possible';

  async function resolve(approve: boolean) {
    if (approve && !confirmed) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setActing(approve ? 'confirm' : 'deny');
    setErr('');
    const { error } = await sb.rpc('resolve_building_retraction', {
      p_building: row.id,
      p_approve: approve,
    });
    if (error) {
      setErr(s.errMsg + error.message);
      setActing(null);
      return;
    }
    onDone();
  }

  return (
    <div className={`rounded-lg border p-4 ${isUrgent ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/20' : 'border-black/10 dark:border-white/10'}`}>
      {isUrgent && (
        <div className="mb-2 rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-800 dark:bg-red-900/40 dark:text-red-200">
          ⚠ {tr(peopleEntry?.label ?? { es: row.people_status, en: row.people_status }, locale)}
        </div>
      )}
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">{s.damage}</span>{' '}
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: damageEntry?.color ?? '#777' }}
          >
            {tr(damageEntry?.label ?? { es: row.damage_level, en: row.damage_level }, locale)}
          </span>
        </div>
        {!isUrgent && peopleEntry && (
          <div>
            <span className="font-medium">{s.people}</span>{' '}
            <span className="text-zinc-600 dark:text-zinc-400">
              {tr(peopleEntry.label, locale)}
            </span>
          </div>
        )}
        <div>
          <span className="font-medium text-zinc-500">{[row.municipio, row.estado].filter(Boolean).join(', ')}</span>
        </div>
        <div>
          <span className="font-medium">{s.reason}</span>{' '}
          <span className="italic text-zinc-600 dark:text-zinc-400">
            {row.retraction_requested_reason || s.noReason}
          </span>
        </div>
        <div className="text-xs text-zinc-400">
          {s.requestedAt}{' '}
          {new Date(row.retraction_requested_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-VE')}
        </div>
      </div>

      {err && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {err}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {s.confirmWarning}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4 w-4 accent-red-600"
            disabled={!!acting}
          />
          <span className="font-medium text-red-700 dark:text-red-400">{s.confirmDialog}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => resolve(true)}
            disabled={!confirmed || !!acting}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {acting === 'confirm' ? s.confirmingBuilding : s.confirm}
          </button>
          <button
            onClick={() => resolve(false)}
            disabled={!!acting}
            className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20 disabled:opacity-40"
          >
            {acting === 'deny' ? s.denyingBuilding : s.deny}
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectionCard({
  row,
  onDone,
}: {
  row: InspectionCancellationRow;
  onDone: () => void;
}) {
  const locale = useLocale();
  const s = STR[locale];
  const [acting, setActing] = useState<'confirm' | 'deny' | null>(null);
  const [err, setErr] = useState('');

  async function resolve(approve: boolean) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setActing(approve ? 'confirm' : 'deny');
    setErr('');
    const { error } = await sb.rpc('resolve_inspection_cancellation', {
      p_request: row.id,
      p_approve: approve,
    });
    if (error) {
      setErr(s.errMsg + error.message);
      setActing(null);
      return;
    }
    onDone();
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">{s.municipio}</span>{' '}
          <span className="text-zinc-600 dark:text-zinc-400">{row.municipio ?? '—'}</span>
        </div>
        <div>
          <span className="font-medium">{s.status}</span>{' '}
          <span className="text-zinc-600 dark:text-zinc-400">{row.status}</span>
        </div>
        {row.claimed_by && (
          <div>
            <span className="font-medium">{s.claimedBy}</span>{' '}
            <span className="font-mono text-xs text-zinc-500">{row.claimed_by}</span>
          </div>
        )}
        <div>
          <span className="font-medium">{s.cancelReason}</span>{' '}
          <span className="italic text-zinc-600 dark:text-zinc-400">
            {row.cancellation_requested_reason || s.noReason}
          </span>
        </div>
        <div className="text-xs text-zinc-400">
          {s.requestedAt}{' '}
          {new Date(row.cancellation_requested_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-VE')}
        </div>
      </div>

      {err && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {err}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => resolve(true)}
          disabled={!!acting}
          className="rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
        >
          {acting === 'confirm' ? s.confirmingInspection : s.confirmCancel}
        </button>
        <button
          onClick={() => resolve(false)}
          disabled={!!acting}
          className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20 disabled:opacity-40"
        >
          {acting === 'deny' ? s.denyingInspection : s.denyCancel}
        </button>
      </div>
    </div>
  );
}

export function RetractionQueue({
  buildings,
  inspections,
}: {
  buildings: BuildingRetractionRow[];
  inspections: InspectionCancellationRow[];
}) {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Building retractions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {s.buildingsHeading}
          {buildings.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {buildings.length}
            </span>
          )}
        </h2>
        {buildings.length === 0 ? (
          <p className="text-sm text-zinc-500">{s.buildingsEmpty}</p>
        ) : (
          <div className="space-y-3">
            {buildings.map((b) => (
              <BuildingCard key={b.id} row={b} onDone={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>

      {/* Inspection cancellations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {s.inspectionsHeading}
          {inspections.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {inspections.length}
            </span>
          )}
        </h2>
        {inspections.length === 0 ? (
          <p className="text-sm text-zinc-500">{s.inspectionsEmpty}</p>
        ) : (
          <div className="space-y-3">
            {inspections.map((r) => (
              <InspectionCard key={r.id} row={r} onDone={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
