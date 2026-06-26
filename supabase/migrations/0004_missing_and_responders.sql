-- =====================================================================
-- 0004 — Missing-person privacy gates (consent + expiry + federation)
--        and responder verification model (tiers + suspension).
-- =====================================================================

-- ---- missing_person_pins: federation + privacy ---------------------
alter type external_source add value if not exists 'desaparecidosvenezuela';
alter type external_source add value if not exists 'desaparecidosterremotovenezuela';
alter type external_source add value if not exists 'pfif_feed';

alter table public.missing_person_pins
  add column consent_given         boolean not null default false,
  add column expires_at            timestamptz not null default (now() + interval '30 days'),
  add column retracted_at          timestamptz,
  add column reporter_contact      text,
  add column reported_by           uuid references auth.users(id),
  add column duplicate_of          uuid references public.missing_person_pins(id),
  add column pfif_person_record_id text unique,
  add column source_updated_at     timestamptz,
  add column cedula                text,
  add column age_estimate          smallint;

-- Federation rule: any non-internal pin MUST link back to its source registry.
alter table public.missing_person_pins
  add constraint mpp_external_requires_url
  check (source = 'internal' or external_url is not null);

-- Rebuild public view: photo only with consent; hide retracted/expired/dupes.
drop view if exists public.missing_person_pins_public;
create view public.missing_person_pins_public with (security_invoker = off) as
  select
    id, display_name,
    public.fuzz_coord(last_seen_lat) as lat,
    public.fuzz_coord(last_seen_lng) as lng,
    estado, municipio, status, source, external_url,
    case when consent_given then photo_url else null end as photo_url,
    last_seen_at, created_at
  from public.missing_person_pins
  where retracted_at is null
    and duplicate_of is null
    and expires_at > now();
grant select on public.missing_person_pins_public to anon, authenticated;

grant insert (consent_given, reporter_contact, cedula, age_estimate)
  on public.missing_person_pins to anon, authenticated;

-- ---- responders: tiers, suspension, verification audit -------------
create type responder_tier as enum ('provisional','verified','senior');

alter table public.responders
  add column tier                       responder_tier not null default 'provisional',
  add column is_coordinator              boolean not null default false,
  add column cedula_identidad            text,
  add column whatsapp_number             text,
  add column credential_issuing_body     text,
  add column credential_doc_secondary_path text,
  add column selfie_with_doc_path        text,
  add column organization_verified       boolean not null default false,
  add column specialty                   text[],
  add column current_estado              text,
  add column operating_estado            text[],
  add column available                   boolean not null default true,
  add column activation_code             text,
  add column verification_notes          text,
  add column verified_at_source          boolean not null default false,
  add column suspended_at                timestamptz,
  add column suspended_reason            text,
  add column applied_at                  timestamptz not null default now();

-- Accountability: a verified responder must record WHO verified them.
alter table public.responders
  add constraint responders_verifier_required
  check (verification <> 'verified' or verified_by is not null);

-- A verified responder is verified AND not suspended. (SECURITY INVOKER set
-- in 0002; we only change the body.)
create or replace function public.is_verified_responder(uid uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.responders r
    where r.id = uid and r.verification = 'verified' and r.suspended_at is null
  );
$$;

-- Coordinators (senior tier or explicit flag) run triage/close actions.
create or replace function public.is_responder_coordinator(uid uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.responders r
    where r.id = uid and r.verification = 'verified' and r.suspended_at is null
      and (r.is_coordinator or r.tier = 'senior')
  );
$$;
revoke execute on function public.is_responder_coordinator(uuid) from anon, public;
grant execute on function public.is_responder_coordinator(uuid) to authenticated;
