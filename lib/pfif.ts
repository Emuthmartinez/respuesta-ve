// PFIF (People Finder Interchange Format) reader — dependency-free.
//
// PFIF is the open XML standard for exchanging missing-person records between
// registries (Google Person Finder and compatible systems emit it). We INGEST
// it read-only: a federated record always links back to its source registry,
// we never become the system of record. See migration 0015 + /personas.
//
// Parsed tolerantly by local tag name (ignoring the `pfif:` namespace prefix,
// which varies by emitter) so a feed from any PFIF 1.3/1.4 source resolves.

import type { MissingStatus } from './types';

export interface PfifPerson {
  /** PFIF person_record_id — the stable cross-feed dedup key. */
  personRecordId: string;
  fullName: string | null;
  givenName: string | null;
  familyName: string | null;
  sex: string | null;
  /** Whole years, when the feed gives `age` (or a single number in a range). */
  age: number | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
  /** Link back to the record on its source registry (federation requirement). */
  sourceUrl: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  photoUrl: string | null;
  description: string | null;
  /** Derived from the latest note's `status`, mapped to our taxonomy. */
  status: MissingStatus;
  /** Free-text last-known-location from the latest note, when present. */
  lastKnownLocation: string | null;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/** First value of a PFIF/Atom field by local name, prefix-agnostic. */
function field(block: string, name: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i');
  const m = block.match(re);
  if (!m) return null;
  const v = decodeEntities(m[1]);
  return v === '' ? null : v;
}

/** All blocks for a repeated element (e.g. every <pfif:note>). */
function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// PFIF note `status` → our missing_status. PFIF has no "injured" concept.
function mapStatus(pfifStatus: string | null): MissingStatus {
  switch ((pfifStatus || '').trim().toLowerCase()) {
    case 'believed_alive':
      return 'found_safe';
    case 'believed_dead':
      return 'deceased';
    case 'believed_missing':
    case 'information_sought':
      return 'missing';
    default:
      return 'missing';
  }
}

function parseAge(raw: string | null): number | null {
  if (!raw) return null;
  // PFIF `age` is "23" or a range "20-30"; take the lower bound as an estimate.
  const m = raw.match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 130 ? n : null;
}

/**
 * Parse a PFIF document into person records. Each person's status and
 * last-known-location come from its most recent associated note.
 */
export function parsePfif(xml: string): PfifPerson[] {
  if (!xml || typeof xml !== 'string') return [];

  // Index notes by person_record_id so we can attach the latest one.
  const notesByPerson = new Map<string, { sourceDate: string | null; status: string | null; loc: string | null }[]>();
  for (const note of blocks(xml, 'note')) {
    const pid = field(note, 'person_record_id');
    if (!pid) continue;
    const arr = notesByPerson.get(pid) ?? [];
    arr.push({
      sourceDate: field(note, 'source_date'),
      status: field(note, 'status'),
      loc: field(note, 'last_known_location'),
    });
    notesByPerson.set(pid, arr);
  }

  const people: PfifPerson[] = [];
  for (const block of blocks(xml, 'person')) {
    const personRecordId = field(block, 'person_record_id');
    if (!personRecordId) continue; // the dedup key is mandatory

    const notes = (notesByPerson.get(personRecordId) ?? [])
      .sort((a, b) => (b.sourceDate ?? '').localeCompare(a.sourceDate ?? ''));
    const latest = notes.find((n) => n.status) ?? notes[0];

    people.push({
      personRecordId,
      fullName: field(block, 'full_name'),
      givenName: field(block, 'given_name') ?? field(block, 'first_name'),
      familyName: field(block, 'family_name') ?? field(block, 'last_name'),
      sex: field(block, 'sex'),
      age: parseAge(field(block, 'age')),
      homeCity: field(block, 'home_city'),
      homeState: field(block, 'home_state'),
      homeCountry: field(block, 'home_country'),
      sourceUrl: field(block, 'source_url'),
      sourceName: field(block, 'source_name'),
      sourceDate: field(block, 'source_date'),
      photoUrl: field(block, 'photo_url'),
      description: field(block, 'description'),
      status: mapStatus(latest?.status ?? null),
      lastKnownLocation: notes.find((n) => n.loc)?.loc ?? null,
    });
  }
  return people;
}

/** Best available display name from a PFIF person. */
export function pfifDisplayName(p: PfifPerson): string | null {
  if (p.fullName) return p.fullName;
  const joined = [p.givenName, p.familyName].filter(Boolean).join(' ').trim();
  return joined || null;
}
