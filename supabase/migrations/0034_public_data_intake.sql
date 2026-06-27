-- =====================================================================
-- 0034 — Public no-key intake queue.
--
-- Accepts arbitrary JSON/text/CSV/url-list payloads from public callers without
-- an API key, stores the raw data in a restricted operator queue, and returns
-- only a receipt. This is deliberately NOT a public feed and never promotes
-- submitted data into canonical crisis records without human review.
-- =====================================================================

create table if not exists public.public_data_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  source text not null,
  source_url text,
  received_via text not null default 'public_api',
  payload_format text not null,
  submission_kind text not null default 'unknown',
  payload jsonb not null,
  payload_size_chars integer not null check (payload_size_chars > 0 and payload_size_chars <= 1048576),
  urls_to_review text[] not null default '{}',
  tags text[] not null default '{}',
  submitted_by_private text,
  contact_private text,
  note_private text,
  warnings text[] not null default '{}',
  review_status text not null default 'received_for_review',
  recommended_action text not null default 'operator_triage',
  disclosure text not null default 'restricted_unverified_public_submission',
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_data_intake_source_url_check check (source_url is null or source_url ~* '^https?://'),
  constraint public_data_intake_format_check check (payload_format in ('json','csv','url_list','text','unknown')),
  constraint public_data_intake_kind_check check (submission_kind in ('person','entity','need','status','media','url_list','mixed','unknown')),
  constraint public_data_intake_review_status_check check (review_status in ('received_for_review','triaged','promoted','ignored','spam')),
  constraint public_data_intake_recommended_action_check check (recommended_action in ('operator_triage','scrape_urls','review_person','review_entity','review_need','ignore')),
  constraint public_data_intake_disclosure_check check (disclosure = 'restricted_unverified_public_submission')
);

comment on table public.public_data_intake_submissions is
  'Restricted public no-key intake queue. Raw payloads are for operators only and are never exposed by public APIs.';
comment on column public.public_data_intake_submissions.payload is
  'Untrusted raw caller payload. Requires human/operator review before any canonical record write.';
comment on column public.public_data_intake_submissions.contact_private is
  'Private submitter contact, never exposed publicly.';

alter table public.public_data_intake_submissions enable row level security;
revoke all on public.public_data_intake_submissions from anon, authenticated;

create index if not exists public_data_intake_submissions_created_at_idx
  on public.public_data_intake_submissions (created_at desc);
create index if not exists public_data_intake_submissions_review_status_idx
  on public.public_data_intake_submissions (review_status, created_at desc);

create or replace function public.submit_public_data_intake(
  p_ip_hash text,
  p_event_id text default 'venezuela-earthquakes-2026',
  p_source text default 'anonymous-public-intake',
  p_source_url text default null,
  p_received_via text default 'public_api',
  p_payload_format text default 'unknown',
  p_submission_kind text default 'unknown',
  p_payload jsonb default '{}'::jsonb,
  p_payload_size_chars integer default null,
  p_urls_to_review text[] default '{}',
  p_tags text[] default '{}',
  p_submitted_by_private text default null,
  p_contact_private text default null,
  p_note_private text default null,
  p_warnings text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent int;
  new_id uuid;
  v_event_id text := coalesce(nullif(trim(p_event_id), ''), 'venezuela-earthquakes-2026');
  v_source text := coalesce(nullif(trim(p_source), ''), 'anonymous-public-intake');
  v_source_url text := nullif(trim(coalesce(p_source_url, '')), '');
  v_received_via text := coalesce(nullif(trim(p_received_via), ''), 'public_api');
  v_payload_format text := coalesce(nullif(trim(p_payload_format), ''), 'unknown');
  v_submission_kind text := coalesce(nullif(trim(p_submission_kind), ''), 'unknown');
  v_urls text[] := coalesce(p_urls_to_review, '{}'::text[]);
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_warnings text[] := coalesce(p_warnings, '{}'::text[]);
  u text;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  if p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'payload_required');
  end if;
  if p_payload_size_chars is null or p_payload_size_chars <= 0 or p_payload_size_chars > 1048576 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_large');
  end if;
  if length(v_event_id) > 120 or length(v_source) > 120 or length(v_received_via) > 80 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  if v_source_url is not null and (length(v_source_url) > 500 or v_source_url !~* '^https?://') then
    return jsonb_build_object('ok', false, 'error', 'bad_source_url');
  end if;
  if v_payload_format not in ('json','csv','url_list','text','unknown') then
    v_payload_format := 'unknown';
  end if;
  if v_submission_kind not in ('person','entity','need','status','media','url_list','mixed','unknown') then
    v_submission_kind := 'unknown';
  end if;
  if coalesce(array_length(v_urls, 1), 0) > 50 or coalesce(array_length(v_tags, 1), 0) > 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items');
  end if;
  foreach u in array v_urls loop
    if length(u) > 500 or u !~* '^https?://' then
      return jsonb_build_object('ok', false, 'error', 'bad_url');
    end if;
  end loop;

  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'public_data_intake'
      and created_at > now() - interval '1 hour';
  if recent >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.public_data_intake_submissions (
    event_id, source, source_url, received_via, payload_format, submission_kind,
    payload, payload_size_chars, urls_to_review, tags, submitted_by_private,
    contact_private, note_private, warnings, ip_hash
  ) values (
    v_event_id, v_source, v_source_url, v_received_via, v_payload_format, v_submission_kind,
    p_payload, p_payload_size_chars, v_urls, v_tags,
    nullif(trim(coalesce(p_submitted_by_private, '')), ''),
    nullif(trim(coalesce(p_contact_private, '')), ''),
    nullif(trim(coalesce(p_note_private, '')), ''),
    v_warnings, p_ip_hash
  ) returning id into new_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'public_data_intake');

  return jsonb_build_object(
    'ok', true,
    'id', new_id,
    'eventId', v_event_id,
    'source', v_source,
    'status', 'received_for_review',
    'authentication', 'none_required',
    'submittedAt', now(),
    'payloadFormat', v_payload_format,
    'submissionKind', v_submission_kind,
    'payloadSizeChars', p_payload_size_chars,
    'urlCount', coalesce(array_length(v_urls, 1), 0),
    'warnings', v_warnings,
    'recommendedAction', 'operator_triage',
    'message', 'Submission received for restricted operator review. No public record is created until a reviewer promotes it.',
    'disclosure', 'restricted_unverified_public_submission'
  );
end; $$;

revoke execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) from public;
grant execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) to anon, authenticated;
