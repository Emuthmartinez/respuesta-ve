'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    confirmRetract: '¿Retirar esta oferta? Esta acción no se puede deshacer.',
    retract: 'Retirar',
    retracting: 'Retirando…',
    retracted: 'Retirada',
    errGeneric: 'No se pudo retirar la oferta.',
    statusPending: 'En revisión',
    statusApproved: 'Publicada',
    statusRejected: 'Rechazada',
    statusSuspended: 'Suspendida',
    statusArchived: 'Archivada',
    available: 'Disponible',
    notAvailable: 'No disponible',
  },
  en: {
    confirmRetract: 'Retract this offer? This action cannot be undone.',
    retract: 'Retract',
    retracting: 'Retracting…',
    retracted: 'Retracted',
    errGeneric: 'Could not retract offer.',
    statusPending: 'Under review',
    statusApproved: 'Published',
    statusRejected: 'Rejected',
    statusSuspended: 'Suspended',
    statusArchived: 'Archived',
    available: 'Available',
    notAvailable: 'Unavailable',
  },
} as const;

interface Props {
  offerId: string;
  skillLabel: string;
  skillDetail: string | null;
  estado: string | null;
  moderationStatus: string | null;
  suspended: boolean;
  available: boolean;
  createdAt: string;
  alreadyFinal: boolean; // archived or suspended — no retract control
}

export function MyOfferCard({
  offerId,
  skillLabel,
  skillDetail,
  estado,
  moderationStatus,
  suspended,
  available,
  createdAt,
  alreadyFinal,
}: Props) {
  const locale = useLocale();
  const s = STR[locale];

  const [status, setStatus] = useState<'idle' | 'retracting' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleRetract() {
    if (!confirm(s.confirmRetract)) return;
    setStatus('retracting');
    setErrMsg('');
    try {
      const res = await fetch('/api/skills/retract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrMsg(json.error ?? s.errGeneric);
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setErrMsg(s.errGeneric);
      setStatus('error');
    }
  }

  function modLabel(ms: string | null): string {
    if (suspended) return s.statusSuspended;
    switch (ms) {
      case 'approved': return s.statusApproved;
      case 'rejected': return s.statusRejected;
      case 'archived': return s.statusArchived;
      default: return s.statusPending;
    }
  }

  const modBadgeColor =
    suspended ? 'text-red-600' :
    moderationStatus === 'approved' ? 'text-green-600' :
    moderationStatus === 'rejected' ? 'text-orange-600' :
    moderationStatus === 'archived' ? 'text-zinc-400' :
    'text-zinc-500';

  const createdDate = new Date(createdAt).toLocaleDateString(locale === 'es' ? 'es-VE' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-medium">{skillLabel}</span>
          {estado && <span className="ml-2 text-xs text-zinc-500">{estado}</span>}
          {skillDetail && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{skillDetail}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={modBadgeColor}>{modLabel(moderationStatus)}</span>
            {!suspended && moderationStatus !== 'archived' && (
              <span className={available ? 'text-green-600' : 'text-zinc-400'}>
                {available ? s.available : s.notAvailable}
              </span>
            )}
            <span className="text-zinc-400">{createdDate}</span>
          </div>
        </div>

        <div className="shrink-0">
          {status === 'done' ? (
            <span className="text-xs font-medium text-zinc-500">{s.retracted}</span>
          ) : !alreadyFinal ? (
            <button
              onClick={handleRetract}
              disabled={status === 'retracting'}
              className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:hover:bg-zinc-800"
            >
              {status === 'retracting' ? s.retracting : s.retract}
            </button>
          ) : null}
        </div>
      </div>

      {errMsg && <p className="mt-2 text-xs text-red-600">{errMsg}</p>}
    </div>
  );
}
