import {
  clusterDisplayStatus,
  clusterHasStatusConflict,
  STATUS_URGENCY,
} from '@/lib/missing-persons';
import type { RedactedRecord } from '@/lib/api/redact';
import type { MissingStatus } from '@/lib/types';

export type StatusAction =
  | 'keep_search_open'
  | 'review_resolution'
  | 'mark_resolved'
  | 'review_conflict';

export interface StatusSummary {
  status: MissingStatus;
  hasConflict: boolean;
  size: number;
  openCount: number;
  resolvedCount: number;
  suggestedAction: StatusAction;
  lastUpdatedAt: string | null;
  sourceUpdatedAt: string | null;
  sources: string[];
}

const OPEN = new Set<MissingStatus>(['missing', 'unknown']);
const RESOLVED = new Set<MissingStatus>(['found_safe', 'found_injured', 'deceased']);

function newest(values: (string | null | undefined)[]): string | null {
  const sorted = values
    .filter((v): v is string => !!v)
    .sort((a, b) => b.localeCompare(a));
  return sorted[0] ?? null;
}

export function summarizeStatus(records: RedactedRecord[], ownId?: string | null): StatusSummary {
  const statuses = records.map((r) => r.status);
  const status = clusterDisplayStatus(statuses);
  const hasConflict = clusterHasStatusConflict(statuses);
  const openCount = statuses.filter((s) => OPEN.has(s)).length;
  const resolvedCount = statuses.filter((s) => RESOLVED.has(s)).length;
  const own = ownId ? records.find((r) => r.id === ownId) : null;
  const ownOpen = !own || OPEN.has(own.status);

  let suggestedAction: StatusAction;
  if (hasConflict && ownOpen && resolvedCount > 0) suggestedAction = 'review_resolution';
  else if (hasConflict) suggestedAction = 'review_conflict';
  else if (STATUS_URGENCY[status] <= STATUS_URGENCY.found_safe) suggestedAction = 'mark_resolved';
  else suggestedAction = 'keep_search_open';

  return {
    status,
    hasConflict,
    size: records.length,
    openCount,
    resolvedCount,
    suggestedAction,
    lastUpdatedAt: newest(records.map((r) => r.updatedAt)),
    sourceUpdatedAt: newest(records.map((r) => r.sourceUpdatedAt)),
    sources: [...new Set(records.map((r) => r.source))].sort(),
  };
}
