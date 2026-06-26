'use client';

import { useState } from 'react';
import { HelpRequestList } from './skills/HelpRequestList';
import { EligibleOffersList } from './skills/EligibleOffersList';
import { CredentialQueue } from './skills/CredentialQueue';

export function SkillsDesk() {
  const [selectedRequest, setSelectedRequest] = useState<{
    id: string;
    skill_needed: string;
    is_high_stakes: boolean;
  } | null>(null);

  return (
    <div className="space-y-8">
      {/* Panel 1 — credential verification queue (always shown) */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Cola de credenciales</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Ofertas de alto riesgo pendientes de verificación. Abre el documento antes de aprobar.
          Sin verificación no se puede conectar al voluntario.
        </p>
        <CredentialQueue />
      </section>

      {/* Panel 2 — open help requests */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Solicitudes abiertas</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Selecciona una para ver los voluntarios compatibles y hacer la conexión.
        </p>
        <HelpRequestList
          selectedId={selectedRequest?.id ?? null}
          onSelect={setSelectedRequest}
        />
      </section>

      {/* Panel 3 — eligible offers (shown only when a request is selected) */}
      {selectedRequest && (
        <section>
          <h2 className="mb-1 text-base font-semibold">
            Voluntarios para:{' '}
            <span className="font-normal text-zinc-600 dark:text-zinc-400">
              {selectedRequest.skill_needed}
            </span>
          </h2>
          {selectedRequest.is_high_stakes && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Habilidad de alto riesgo. Solo se muestran ofertas aprobadas con credencial verificada.
              Conectar requiere verificación completa.
            </p>
          )}
          <EligibleOffersList
            requestId={selectedRequest.id}
            skillNeeded={selectedRequest.skill_needed}
            isHighStakes={selectedRequest.is_high_stakes}
          />
        </section>
      )}
    </div>
  );
}
