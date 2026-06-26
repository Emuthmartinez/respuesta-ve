# Missing-person federation + dedup pipeline

Reusable tooling that **ports** missing-person records from external registries
into our federated index and **deduplicates** them with the engine in
[`lib/missing-persons.ts`](../../lib/missing-persons.ts). Built for the June 2026
Venezuela earthquake response.

> **Philosophy:** federate + link back, never re-host photos, surface duplicates
> but never destructively auto-merge. The only record-hiding action is the
> coordinator-gated, reversible `duplicate_of` merge (RPCs in migration 0017).

## The engine (what makes dedup correct)

`lib/missing-persons.ts` resolves the same person across spelling variants, ages,
localities and photos with a **multi-signal cascade**:

1. **Cédula** (V/E-prefix-preserving) — deterministic. `V8765432 ≠ E8765432`
   (citizen vs foreigner are different people → hard veto on mismatch).
2. **Photo dHash** — "same image ⇒ same person, UNLESS two distinct people share
   the photo." Confirms only when the given name also agrees; a shared photo
   across different names is a **group photo** → flagged for review, never merged.
3. **Name + age + locality** (fuzzy, advisory) — IDF-weighted (a shared rare
   surname like *Poleo* counts; a shared common one like *Rodríguez* needs
   corroboration), gated on ≥2 shared tokens **and given-name agreement** (so
   *Ángel Gavidia* and *Aris Gavidia* — family — never merge).

Two presentation tiers, as required: **Identificados** (cédula) vs **Agrupación
aproximada** (everything else). See `lib/missing-persons.test.mjs` for the guards.

## Sources

| Source | Access | Notes |
|---|---|---|
| desaparecidosterremotovenezuela.com (~57k) | reCAPTCHA v3 | `harvest.mjs` reads it as a real visitor — the site's own page mints the token; we don't defeat the protection, we use the site as intended, at a respectful rate. |
| venezuelatebusca.com | public SSR | React-Router SPA; records server-rendered with photos. |
| sosvenezuela2026.com (~57k) | auth-gated persons API | Not ingested (would require credentials). |
| Google Person Finder (PFIF) | dead for this event | `app/api/personas/ingest` is the live PFIF path if a feed appears. |

## Pipeline

```bash
# 1) Harvest (drives local headless Chrome; resumable). Requires Google Chrome.
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --remote-debugging-port=9222 \
  --user-data-dir="$(mktemp -d)" about:blank &
node scripts/missing-persons/harvest.mjs 1 2850 data/personas.jsonl 700

# 2) Perceptual-hash the public photos (curl + ImageMagick; stores ONLY the hash).
node scripts/missing-persons/phash.mjs data/personas.jsonl data/photohash.jsonl 12

# 3) Dedup + ingest (dry-run first to see the cluster report).
node scripts/missing-persons/dedup-ingest.mjs            # dry run
node scripts/missing-persons/dedup-ingest.mjs --ingest   # write via RPC
```

`dedup-ingest.mjs` reads `DATA_DIR` (default `./data`) and the repo `.env.local`
for `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It ingests via
`submit_missing_person_record` using a `federation-*` identity (throttle-exempt),
inserting clusters concurrently but members sequentially so edges reference
already-inserted neighbours (one pass, correct union-find).

## What is dropped on ingest (privacy)

- Reporter phone numbers (the `contacto` field) — never stored.
- Photos — fetched transiently to hash, then discarded; we never re-host them.
- Cédulas typed into the name/location free-text are scrubbed from the public
  projection; the normalized cédula is a **server-only** match key (the public
  view exposes only a `cedula_confirmed` badge, never the digits).

## Backfilling the rest

`harvest.mjs` is resumable (skips ids already in the output file). reCAPTCHA v3
will rate-limit a sustained automated session; if it starts returning 403, stop,
wait, and resume later with a higher delay. ~20% of the registry (11.6k records)
was the initial respectful pull.
