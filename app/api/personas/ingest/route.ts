// Federated missing-person ingestion — pulls PFIF records from external
// registries into the read-only `missing_person_pins` index so families
// search in one place. Token-gated; intended to be hit by a recurring routine
// (cron) the same way the damage-lead pipeline runs.
//
// Body (JSON): { feedUrl?, xml?, source?, dryRun? }
//   feedUrl  — a PFIF feed URL to fetch + parse
//   xml      — raw PFIF XML (for testing without a live feed)
//   source   — external_source enum value (default 'pfif_feed')
//   dryRun   — parse + dedupe + report, write nothing
// Auth: Authorization: Bearer <INGEST_TOKEN>  (or ?token=)
//
// Dedupe stance: SURFACE, NEVER AUTO-MERGE. We compute possible-duplicate
// edges and store them as advisory annotations only.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { parsePfif, pfifDisplayName, type PfifPerson } from '@/lib/pfif';
import { findPossibleDuplicates, type MatchableRecord } from '@/lib/missing-persons';

export const dynamic = 'force-dynamic';

const INGEST_IP_HASH = 'personas-pfif-ingest'; // stable throttle identity for the routine

function authorized(req: NextRequest): boolean {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return false; // refuse until configured — never open by default
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const qp = req.nextUrl.searchParams.get('token');
  return bearer === expected || qp === expected;
}

interface ExistingRow {
  id: string;
  display_name: string | null;
  age_estimate: number | null;
  estado: string | null;
  municipio: string | null;
}

const toMatchable = (p: PfifPerson): MatchableRecord => ({
  displayName: pfifDisplayName(p),
  age: p.age,
  estado: p.homeState,
  municipio: p.homeCity,
});

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: { feedUrl?: string; xml?: string; source?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const dryRun = body.dryRun === true || req.nextUrl.searchParams.get('dryRun') === '1';
  const source = body.source || 'pfif_feed';

  // 1. Obtain the PFIF document.
  let xml = body.xml ?? '';
  if (!xml && body.feedUrl) {
    try {
      const res = await fetch(body.feedUrl, { headers: { Accept: 'application/xml, text/xml' } });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `feed_fetch_${res.status}` }, { status: 502 });
      }
      xml = await res.text();
    } catch {
      return NextResponse.json({ ok: false, error: 'feed_unreachable' }, { status: 502 });
    }
  }
  if (!xml) {
    return NextResponse.json({ ok: false, error: 'no_feed_or_xml' }, { status: 400 });
  }

  // 2. Parse. Federation requires a link-back URL, so drop records without one.
  const parsed = parsePfif(xml);
  const usable = parsed.filter((p) => p.sourceUrl);
  const skippedNoUrl = parsed.length - usable.length;

  const sb = await getSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'db_unconfigured' }, { status: 503 });
  }

  // 3. Pull existing federated records as dedup candidates.
  const { data: existing } = await sb
    .from('missing_person_pins_public')
    .select('id, display_name, age_estimate, estado, municipio')
    .limit(2000);
  const candidates: (MatchableRecord & { id: string })[] = ((existing as ExistingRow[]) ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    age: r.age_estimate,
    estado: r.estado,
    municipio: r.municipio,
  }));

  // 4. Per record: compute possible duplicates (surface only) + write/dry-run.
  const results: { personRecordId: string; action: string; possibleDuplicates: number; error?: string }[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const p of usable) {
    const dups = findPossibleDuplicates(toMatchable(p), candidates);
    const dupIds = dups.map((d) => d.id);
    const topScore = dups[0]?.score ?? null;

    if (dryRun) {
      results.push({ personRecordId: p.personRecordId, action: 'dry_run', possibleDuplicates: dups.length });
      continue;
    }

    const { data, error } = await sb.rpc('submit_missing_person_record', {
      p_ip_hash: INGEST_IP_HASH,
      p_external_record_id: p.personRecordId,
      p_source: source,
      p_external_url: p.sourceUrl,
      p_display_name: pfifDisplayName(p),
      p_last_seen_lat: null,
      p_last_seen_lng: null,
      p_last_seen_at: null,
      p_estado: p.homeState,
      p_municipio: p.homeCity,
      p_age_estimate: p.age,
      p_cedula: null,
      p_status: p.status,
      p_notes: p.description ?? p.lastKnownLocation,
      p_source_updated_at: p.sourceDate,
      p_possible_duplicate_ids: dupIds.length ? dupIds : null,
      p_dedupe_score: topScore,
    });

    const r = data as { ok?: boolean; action?: string; error?: string } | null;
    if (error || !r?.ok) {
      failed++;
      results.push({ personRecordId: p.personRecordId, action: 'error', possibleDuplicates: dups.length, error: error?.message ?? r?.error ?? 'unknown' });
    } else {
      if (r.action === 'updated') updated++;
      else inserted++;
      results.push({ personRecordId: p.personRecordId, action: r.action ?? 'inserted', possibleDuplicates: dups.length });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    parsed: parsed.length,
    usable: usable.length,
    skippedNoUrl,
    inserted,
    updated,
    failed,
    results,
  });
}
