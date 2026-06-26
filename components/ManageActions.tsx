'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

const STR = {
  es: {
    retract: 'Retirar este envío',
    confirmTitle: '¿Seguro que quieres retirarlo?',
    confirmBody: 'Dejará de aparecer públicamente. Esta acción queda registrada.',
    reasonLabel: 'Motivo (opcional)',
    reasonPlaceholder: 'Ej.: ya fue resuelto, fue un error…',
    cancel: 'Cancelar',
    confirm: 'Sí, retirar',
    working: 'Retirando…',
    doneRetracted: 'Retirado. Ya no aparece públicamente.',
    donePending: 'Solicitud de retiro recibida. Por seguridad, un coordinador la confirmará antes de ocultarlo (hay una respuesta en curso).',
    alreadyRetracted: 'Este envío ya fue retirado.',
    alreadyPending: 'Tu retiro ya está pendiente de confirmación.',
    lifeSafetyNote: 'Como este reporte indica personas posiblemente atrapadas, el retiro requiere la confirmación de un coordinador para no cancelar un rescate por error.',
    error: 'No se pudo retirar. Intenta de nuevo.',
    rateLimited: 'Demasiados intentos. Espera un momento.',
  },
  en: {
    retract: 'Withdraw this submission',
    confirmTitle: 'Withdraw this submission?',
    confirmBody: 'It will stop showing publicly. This action is logged.',
    reasonLabel: 'Reason (optional)',
    reasonPlaceholder: 'E.g.: already resolved, was a mistake…',
    cancel: 'Cancel',
    confirm: 'Yes, withdraw',
    working: 'Withdrawing…',
    doneRetracted: 'Withdrawn. No longer shown publicly.',
    donePending: 'Withdrawal request received. For safety, a coordinator will confirm it before hiding it (a response is in progress).',
    alreadyRetracted: 'This submission was already withdrawn.',
    alreadyPending: 'Your withdrawal is already pending confirmation.',
    lifeSafetyNote: 'Because this report indicates people possibly trapped, withdrawal needs a coordinator to confirm so a rescue is not cancelled by mistake.',
    error: 'Could not withdraw. Please try again.',
    rateLimited: 'Too many attempts. Please wait a moment.',
  },
} as const;

type Phase = 'idle' | 'confirming' | 'working' | 'retracted' | 'pending' | 'error';

export function ManageActions({
  token, entity, id, alreadyRetracted, pendingReview, lifeSafety, locale,
}: {
  token: string;
  entity: string;
  id: string;
  alreadyRetracted: boolean;
  pendingReview: boolean;
  lifeSafety: boolean;
  locale: Locale;
}) {
  const s = STR[locale];
  const [phase, setPhase] = useState<Phase>(
    alreadyRetracted ? 'retracted' : pendingReview ? 'pending' : 'idle',
  );
  const [reason, setReason] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function doRetract() {
    setPhase('working');
    setErrMsg('');
    try {
      const res = await fetch('/api/gestionar/retract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, entity, id, reason: reason || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPhase('error');
        setErrMsg(json.error === 'rate_limited' ? s.rateLimited : s.error);
        return;
      }
      // retraction_pending / cancellation_pending => coordinator/responder confirm
      setPhase(json.status === 'retracted' ? 'retracted' : 'pending');
    } catch {
      setPhase('error');
      setErrMsg(s.error);
    }
  }

  if (phase === 'retracted') {
    return <p className="mt-5 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{alreadyRetracted ? s.alreadyRetracted : s.doneRetracted}</p>;
  }
  if (phase === 'pending') {
    return <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{pendingReview ? s.alreadyPending : s.donePending}</p>;
  }

  return (
    <div className="mt-5">
      {phase !== 'confirming' && (
        <button
          onClick={() => setPhase('confirming')}
          className="w-full rounded-full border border-red-500 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          {s.retract}
        </button>
      )}

      {phase === 'confirming' && (
        <div className="rounded-xl border border-red-300 p-4 dark:border-red-900/60">
          <p className="text-sm font-semibold">{s.confirmTitle}</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.confirmBody}</p>
          {lifeSafety && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {s.lifeSafetyNote}
            </p>
          )}
          <label className="mt-3 block text-xs font-medium text-zinc-500">{s.reasonLabel}</label>
          <textarea
            className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={s.reasonPlaceholder}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={doRetract}
              className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {s.confirm}
            </button>
            <button
              onClick={() => setPhase('idle')}
              className="flex-1 rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
            >
              {s.cancel}
            </button>
          </div>
        </div>
      )}

      {phase === 'working' && <p className="mt-3 text-sm text-zinc-500">{s.working}</p>}
      {phase === 'error' && <p className="mt-3 text-sm text-red-600">{errMsg}</p>}
    </div>
  );
}
