// Zod request schemas for the partner API. Validation is the first security
// layer: every endpoint parses its body through these before any DB work, so
// malformed / oversized / injection-y input is rejected at the edge.

import { z } from 'zod';
import { MISSING_STATUSES } from '@/lib/api/redact';
import { detectMultiPerson, normalizeCedula, type MatchableRecord } from '@/lib/missing-persons';

const str = (max: number) => z.string().trim().min(1).max(max);

/** A person record as a partner sends it. Only `name` is required. */
export const PersonInput = z.object({
  name: str(200),
  age: z.number().int().min(0).max(130).nullish(),
  estado: str(80).nullish(),
  municipio: str(120).nullish(),
  /** Cédula is used ONLY as a match key — normalized server-side, never echoed. */
  cedula: z.string().trim().max(20).nullish(),
  /** Optional precomputed 16-hex dHash of the person's photo (we don't fetch photos). */
  photoPhash: z.string().trim().regex(/^[0-9a-fA-F]{16}$/, 'photoPhash must be 16 hex chars').nullish(),
  status: z.enum(MISSING_STATUSES).nullish(),
  /** When the person was last seen; do not use this as the sync clock. */
  lastSeenAt: z.string().trim().max(40).nullish(),
  /** Source-system update timestamp. Existing rows only change status when this is newer. */
  sourceUpdatedAt: z.string().trim().max(40).nullish(),
}).strict();
export type PersonInputT = z.infer<typeof PersonInput>;

/** Partner input → the engine's MatchableRecord (cédula normalized, never echoed). */
export function toMatchable(p: PersonInputT, id?: string): MatchableRecord {
  return {
    id,
    displayName: p.name,
    age: p.age ?? null,
    estado: p.estado ?? null,
    municipio: p.municipio ?? null,
    cedulaNorm: normalizeCedula(p.cedula),
    photoPhash: p.photoPhash ? p.photoPhash.toLowerCase() : null,
    isMultiPerson: detectMultiPerson(p.name), // computed server-side; never trusted from caller input
  };
}

/** POST /api/v1/score — pure scoring, no DB. Compare one record to many. */
export const ScoreRequest = z.object({
  record: PersonInput,
  candidates: z.array(PersonInput).min(1).max(200),
}).strict();

/** POST /api/v1/match — match a record against the live federated index. */
export const MatchRequest = z.object({
  record: PersonInput,
  limit: z.number().int().min(1).max(50).default(20),
}).strict();

/** POST /api/v1/persons — dedupe + federate-store. Link-back is mandatory. */
export const IngestRequest = z.object({
  record: PersonInput,
  externalId: str(200),                 // partner's stable id (idempotent upsert key)
  externalUrl: z.url().max(500),  // link back to the source record — REQUIRED
  source: z.enum(['venezuelatebusca', 'desaparecidosterremotovenezuela', 'desaparecidosvenezuela', 'pfif_feed', 'other']).default('other'),
}).strict();

export const StatusQuery = z.object({
  externalId: str(200),
}).strict();

export const ChangesQuery = z.object({
  since: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(500).default(100),
}).strict();

/** Build a stable z error → flat message list. */
export function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ');
}
