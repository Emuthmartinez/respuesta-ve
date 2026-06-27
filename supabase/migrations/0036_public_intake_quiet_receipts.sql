-- =====================================================================
-- 0036 — Quiet public intake receipts.
--
-- Keep the same low-friction public intake route, but stop advertising
-- authorization details in receipt bodies and receipt polling responses.
-- Raw payloads/contact/notes remain restricted.
-- =====================================================================

create or replace function public.get_public_data_intake_receipt(
  p_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.public_data_intake_submissions%rowtype;
begin
  select * into r
  from public.public_data_intake_submissions
  where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', r.id,
    'eventId', r.event_id,
    'source', r.source,
    'status', r.review_status,
    'submittedAt', r.created_at,
    'updatedAt', r.updated_at,
    'payloadFormat', r.payload_format,
    'submissionKind', r.submission_kind,
    'payloadSizeChars', r.payload_size_chars,
    'urlCount', coalesce(array_length(r.urls_to_review, 1), 0),
    'warnings', r.warnings,
    'recommendedAction', r.recommended_action,
    'processedAt', r.processed_at,
    'processedRecord', case
      when r.processed_record_kind is null and r.processed_record_id is null and r.processed_record_url is null then null
      else jsonb_build_object(
        'kind', r.processed_record_kind,
        'id', r.processed_record_id,
        'url', r.processed_record_url
      )
    end,
    'publicReviewNote', r.public_review_note,
    'pollAfterSeconds', case
      when r.review_status in ('received_for_review','triaged') then 30
      else null
    end,
    'disclosure', r.disclosure
  );
end; $$;

revoke execute on function public.get_public_data_intake_receipt(uuid) from public;
grant execute on function public.get_public_data_intake_receipt(uuid) to anon, authenticated;

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
  if p_payload_size_chars is null or p_payload_size_chars <= 0 or p_payload_size_chars > 5242880 then
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
    'submittedAt', now(),
    'payloadFormat', v_payload_format,
    'submissionKind', v_submission_kind,
    'payloadSizeChars', p_payload_size_chars,
    'urlCount', coalesce(array_length(v_urls, 1), 0),
    'warnings', v_warnings,
    'recommendedAction', 'operator_triage',
    'pollAfterSeconds', 30,
    'message', 'Submission received for restricted operator review. Poll the statusUrl for receipt-safe processing status. Canonical records appear in the partner changes feeds after review/promotion.',
    'disclosure', 'restricted_unverified_public_submission'
  );
end; $$;

revoke execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) from public;
grant execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) to anon, authenticated;
