import type { Bilingual } from '@/lib/i18n';

export type FederationPartnerStatus = 'active' | 'onboarding';

export interface FederationPartner {
  id: string;
  name: string;
  href: string;
  status: FederationPartnerStatus;
  statusLabel: Bilingual;
  tagline: Bilingual;
  description: Bilingual;
  contributionTags: Bilingual[];
  flow: Bilingual[];
  lastReviewedLabel: Bilingual;
}

export const federationPartners: FederationPartner[] = [
  {
    id: 'terremotovenezuela-app',
    name: 'terremotovenezuela.app',
    href: 'https://terremotovenezuela.app',
    status: 'active',
    statusLabel: { es: 'Conectado ahora', en: 'Connected now' },
    tagline: {
      es: 'Mapa ciudadano, carga de archivos y coordinación local.',
      en: 'Citizen map, file uploads, and local coordination.',
    },
    description: {
      es:
        'Envía reportes, personas, hospitales, pacientes restringidos, archivos, texto y recursos de la diáspora a Respuesta VE para revisión, limpieza, deduplicación y promoción a registros normalizados.',
      en:
        'Sends reports, people, hospitals, restricted patient signals, files, text, and diaspora resources to Respuesta VE for review, cleanup, dedupe, and promotion into normalized records.',
    },
    contributionTags: [
      { es: 'Reportes del mapa', en: 'Map reports' },
      { es: 'Personas', en: 'People' },
      { es: 'Hospitales', en: 'Hospitals' },
      { es: 'Archivos y texto', en: 'Files and text' },
      { es: 'Acopio fuera de Venezuela', en: 'Collection centers abroad' },
    ],
    flow: [
      {
        es: 'La superficie recibe datos de la comunidad y conserva su operación local.',
        en: 'The surface receives community data and keeps its local operation.',
      },
      {
        es: 'Respuesta VE guarda los envíos en una cola restringida para revisión y limpieza.',
        en: 'Respuesta VE stores submissions in a restricted queue for review and cleanup.',
      },
      {
        es: 'Los registros aprobados se publican como personas o entidades canónicas con procedencia.',
        en: 'Approved records publish as canonical people or entities with provenance.',
      },
      {
        es: 'Las superficies sincronizan la verdad procesada con cursores de cambios.',
        en: 'Surfaces sync processed truth through change-feed cursors.',
      },
    ],
    lastReviewedLabel: { es: 'Primer socio conectado', en: 'First connected partner' },
  },
];

export const federationCapabilities: Bilingual[] = [
  { es: 'Intake de datos en cualquier forma para revisión operativa', en: 'Data intake in any shape for operational review' },
  { es: 'Limpieza y normalización hacia personas, entidades, necesidades y canales', en: 'Cleanup and normalization into people, entities, needs, and channels' },
  { es: 'Deduplicación revisable, nunca fusión automática irreversible', en: 'Reviewable dedupe, never irreversible automatic merge' },
  { es: 'Recibos seguros para el remitente y feeds canónicos para socios', en: 'Safe sender receipts and canonical feeds for partners' },
  { es: 'Procedencia por fuente, privacidad y coordenadas públicas difuminadas', en: 'Source provenance, privacy, and fuzzed public coordinates' },
];
