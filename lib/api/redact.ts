// PII redaction for partner-API responses. The matching engine reads cédula and
// photo hashes to FIND duplicates, but those signals must never flow back out:
// the API returns only the same metadata the public registry already shows, plus
// an "identified by cédula" badge — never the digits, never reporter contact,
// never a photo, never another record's hash.

import type { MatchMethod, MatchConfidence } from '@/lib/missing-persons';
import type { MissingStatus } from '@/lib/types';

export const MISSING_STATUSES = ['missing', 'found_safe', 'found_injured', 'deceased', 'unknown'] as const;

/** Row of the public view, as the matching service reads it. */
export interface PublicRow {
  id: string;
  display_name: string | null;
  estado: string | null;
  municipio: string | null;
  status: MissingStatus;
  source: string;
  external_url: string | null;
  age_estimate: number | null;
  cedula_confirmed: boolean;
  cluster_id: string | null;
  cluster_size: number;
  is_multi_person: boolean;
  last_seen_at: string | null;
}

/** What a partner sees for each record — strictly the public projection. */
export interface RedactedRecord {
  id: string;
  name: string | null;
  estado: string | null;
  municipio: string | null;
  status: MissingStatus;
  source: string;
  externalUrl: string | null;
  age: number | null;
  cedulaConfirmed: boolean;
  clusterId: string | null;
  clusterSize: number;
  isMultiPerson: boolean;
  lastSeenAt: string | null;
}

export interface MatchOut extends RedactedRecord {
  score: number;
  method: MatchMethod;
  confidence: MatchConfidence;
}

/** Public-view row → redacted partner record. Never carries cédula/contact/photo. */
export function redact(row: PublicRow): RedactedRecord {
  return {
    id: row.id,
    name: row.display_name,
    estado: row.estado,
    municipio: row.municipio,
    status: row.status,
    source: row.source,
    externalUrl: row.external_url,
    age: row.age_estimate,
    cedulaConfirmed: !!row.cedula_confirmed,
    clusterId: row.cluster_id,
    clusterSize: row.cluster_size,
    isMultiPerson: row.is_multi_person,
    lastSeenAt: row.last_seen_at,
  };
}

