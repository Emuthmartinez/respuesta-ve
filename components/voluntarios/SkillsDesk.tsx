'use client';

import { useState } from 'react';
import { HelpRequestList } from './skills/HelpRequestList';
import { EligibleOffersList } from './skills/EligibleOffersList';
import { CredentialQueue } from './skills/CredentialQueue';
import { useLocale } from '@/lib/locale-context';

type MobileTab = 'solicitudes' | 'voluntarios';

const STR = {
  es: {
    credentialQueueTitle: 'Cola de credenciales',
    credentialQueueDesc:
      'Ofertas de alto riesgo pendientes de verificación. Abre el documento antes de aprobar. Sin verificación no se puede conectar al voluntario.',
    matchDeskTitle: 'Mesa de conexiones',
    matchDeskDesc:
      'Selecciona una solicitud abierta, verifica credenciales si aplica, y conecta al voluntario con quien lo necesita.',
    tabRequests: 'Solicitudes',
    tabVolunteers: 'Voluntarios',
    openRequests: 'Solicitudes abiertas',
    volunteersFor: 'Voluntarios para:',
    selectRequest: 'Selecciona una solicitud para ver voluntarios',
    highStakesNote:
      'Habilidad de alto riesgo. Solo se muestran ofertas aprobadas con credencial verificada. Conectar requiere verificación completa.',
  },
  en: {
    credentialQueueTitle: 'Credential queue',
    credentialQueueDesc:
      'High-stakes offers pending verification. Open the document before approving. Without verification the volunteer cannot be connected.',
    matchDeskTitle: 'Matching desk',
    matchDeskDesc:
      'Select an open request, verify credentials if applicable, and connect the volunteer with whoever needs help.',
    tabRequests: 'Requests',
    tabVolunteers: 'Volunteers',
    openRequests: 'Open requests',
    volunteersFor: 'Volunteers for:',
    selectRequest: 'Select a request to see volunteers',
    highStakesNote:
      'High-stakes skill. Only approved offers with a verified credential are shown. Connecting requires full verification.',
  },
} as const;

export function SkillsDesk() {
  const locale = useLocale();
  const s = STR[locale];

  const [selectedRequest, setSelectedRequest] = useState<{
    id: string;
    skill_needed: string;
    is_high_stakes: boolean;
  } | null>(null);

  // Mobile tab is only used on narrow screens; auto-switches to 'voluntarios' on selection
  const [mobileTab, setMobileTab] = useState<MobileTab>('solicitudes');

  function handleSelect(r: { id: string; skill_needed: string; is_high_stakes: boolean } | null) {
    setSelectedRequest(r);
    if (r) setMobileTab('voluntarios');
  }

  return (
    <div className="space-y-8">
      {/* Panel 1 — credential verification queue (always shown) */}
      <section>
        <h2 className="sticky top-0 z-10 -mx-4 mb-3 bg-white/90 px-4 pb-2 pt-2 text-base font-semibold backdrop-blur dark:bg-zinc-950/90 sm:-mx-6 sm:px-6">
          {s.credentialQueueTitle}
        </h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {s.credentialQueueDesc}
        </p>
        <CredentialQueue />
      </section>

      {/* Panel 2 + 3 — matching desk */}
      <section>
        <h2 className="sticky top-0 z-10 -mx-4 mb-3 bg-white/90 px-4 pb-2 pt-2 text-base font-semibold backdrop-blur dark:bg-zinc-950/90 sm:-mx-6 sm:px-6">
          {s.matchDeskTitle}
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {s.matchDeskDesc}
        </p>

        {/* ── Mobile tab bar (hidden on sm+) ── */}
        <div className="mb-3 flex rounded-lg border border-black/10 p-0.5 dark:border-white/10 sm:hidden">
          <button
            onClick={() => setMobileTab('solicitudes')}
            className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
              mobileTab === 'solicitudes'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s.tabRequests}
          </button>
          <button
            onClick={() => setMobileTab('voluntarios')}
            className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
              mobileTab === 'voluntarios'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s.tabVolunteers}
            {selectedRequest && (
              <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white">
                1
              </span>
            )}
          </button>
        </div>

        {/* ── Desktop: two-column grid; Mobile: single-panel based on tab ── */}
        <div className="sm:grid sm:grid-cols-2 sm:gap-6 sm:items-start">
          {/* Left column — help requests */}
          <div className={mobileTab === 'solicitudes' ? 'block' : 'hidden sm:block'}>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {s.openRequests}
            </h3>
            <HelpRequestList
              selectedId={selectedRequest?.id ?? null}
              onSelect={handleSelect}
            />
          </div>

          {/* Right column — eligible offers */}
          <div className={mobileTab === 'voluntarios' ? 'block' : 'hidden sm:block'}>
            {selectedRequest ? (
              <>
                <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {s.volunteersFor}{' '}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    {selectedRequest.skill_needed}
                  </span>
                </h3>
                {selectedRequest.is_high_stakes && (
                  <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {s.highStakesNote}
                  </p>
                )}
                <EligibleOffersList
                  requestId={selectedRequest.id}
                  skillNeeded={selectedRequest.skill_needed}
                  isHighStakes={selectedRequest.is_high_stakes}
                />
              </>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-black/15 text-center dark:border-white/15">
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  {s.selectRequest}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
