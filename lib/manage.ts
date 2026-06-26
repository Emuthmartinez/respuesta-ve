// Shared metadata for the self-service "manage your submission" flow.
// Ownership = possession of the one-time token handed back at submit time
// (sha256 stored as token_hash). These helpers are pure and import-safe from
// both server and client components.
import type { Locale } from './i18n';

// The entity keys understood by the retract_submission / lookup_submission RPCs.
export type ManagedEntity =
  | 'building'
  | 'donation_center'
  | 'organization'
  | 'help_request'
  | 'inspection_request'
  | 'misinfo_report';

const ENTITY_LABEL: Record<ManagedEntity, { es: string; en: string }> = {
  building: { es: 'Reporte de daños', en: 'Damage report' },
  donation_center: { es: 'Centro de acopio', en: 'Collection center' },
  organization: { es: 'Organización sugerida', en: 'Suggested organization' },
  help_request: { es: 'Solicitud de ayuda', en: 'Help request' },
  inspection_request: { es: 'Solicitud de inspección', en: 'Inspection request' },
  misinfo_report: { es: 'Reporte de desinformación', en: 'Misinformation report' },
};

export function entityLabel(entity: string, locale: Locale): string {
  const e = ENTITY_LABEL[entity as ManagedEntity];
  return e ? e[locale] : entity;
}

// Friendly, reassuring status copy. Maps the raw DB enum strings (any entity)
// to one of a few human states a submitter understands.
type StatusKind = 'pending' | 'live' | 'retracted' | 'review' | 'closed';

function classify(status: string, retracted: boolean, pendingReview: boolean): StatusKind {
  if (pendingReview) return 'review';
  if (retracted) return 'retracted';
  if (['pending', 'suggested', 'submitted', 'triaged'].includes(status)) return 'pending';
  if (['approved', 'active', 'published', 'open', 'claimed', 'in_progress', 'assessed', 'matched'].includes(status)) return 'live';
  if (['retracted', 'inactive', 'cancelled', 'rejected', 'archived', 'closed', 'expired', 'rejected_spam'].includes(status)) return 'closed';
  return 'pending';
}

const STATUS_COPY: Record<StatusKind, { es: string; en: string }> = {
  pending: { es: 'En revisión — un coordinador la revisará antes de publicarla.', en: 'Under review — a coordinator will review it before it goes public.' },
  live: { es: 'Publicada y visible.', en: 'Published and visible.' },
  retracted: { es: 'Retirada. Ya no aparece públicamente.', en: 'Withdrawn. No longer shown publicly.' },
  review: { es: 'Tu retiro está pendiente de confirmación por un coordinador.', en: 'Your withdrawal is pending confirmation by a coordinator.' },
  closed: { es: 'Cerrada.', en: 'Closed.' },
};

export function statusCopy(
  status: string,
  opts: { retracted: boolean; pendingReview: boolean },
  locale: Locale,
): { kind: StatusKind; text: string } {
  const kind = classify(status, opts.retracted, opts.pendingReview);
  return { kind, text: STATUS_COPY[kind][locale] };
}
