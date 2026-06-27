-- =====================================================================
-- 0037 — Public intake reviewer path + guarded submit RPC.
--
-- Keep public callers on the Next route so IP throttling and body-size checks
-- cannot be bypassed through direct anon-key RPC calls. Coordinators and
-- trusted cleanup workers review the restricted queue through whitelisted RPCs;
-- the raw table remains fully revoked from anon/authenticated.
-- =====================================================================

drop function if exists public.submit_public_data_intake(
  text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
);

create or replace function public.submit_public_data_intake(
  p_rpc_secret text,
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
  v_rpc_secret text := nullif(current_setting('app.public_intake_rpc_secret', true), '');
  v_event_id text := coalesce(nullif(trim(p_event_id), ''), 'venezuela-earthquakes-2026');
  v_source text := coalesce(nullif(trim(p_source), ''), 'anonymous-public-intake');
  v_source_url text := nullif(trim(coalesce(p_source_url, '')), '');
  v_received_via text := coalesce(nullif(trim(p_received_via), ''), 'public_api');
  v_payload_format text := coalesce(nullif(trim(p_payload_format), ''), 'unknown');
  v_submission_kind text := coalesce(nullif(trim(p_submission_kind), ''), 'unknown');
  v_urls text[] := coalesce(p_urls_to_review, '{}'::text[]);
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_warnings text[] := coalesce(p_warnings, '{}'::text[]);
  v_payload_size_bytes integer := greatest(coalesce(p_payload_size_chars, 0), octet_length(coalesce(p_payload::text, '')));
  u text;
begin
  if v_rpc_secret is null or p_rpc_secret is distinct from v_rpc_secret then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  if p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'payload_required');
  end if;
  if v_payload_size_bytes <= 0 or v_payload_size_bytes > 5242880 then
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
    p_payload, v_payload_size_bytes, v_urls, v_tags,
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
    'payloadSizeChars', v_payload_size_bytes,
    'urlCount', coalesce(array_length(v_urls, 1), 0),
    'warnings', v_warnings,
    'recommendedAction', 'operator_triage',
    'pollAfterSeconds', 30,
    'message', 'Submission received for restricted operator review. Poll the statusUrl for receipt-safe processing status. Canonical records appear in the partner changes feeds after review/promotion.',
    'disclosure', 'restricted_unverified_public_submission'
  );
end; $$;

revoke execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) from public;
grant execute on function public.submit_public_data_intake(
  text, text, text, text, text, text, text, text, jsonb, integer, text[], text[], text, text, text, text[]
) to anon, authenticated;

create or replace function public.list_public_data_intake_submissions(
  p_status text default null,
  p_limit int default 50,
  p_before timestamptz default null,
  p_rpc_secret text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rpc_secret text := nullif(current_setting('app.public_intake_rpc_secret', true), '');
  v_authorized boolean := public.is_responder_coordinator(auth.uid())
    or (v_rpc_secret is not null and p_rpc_secret is not null and p_rpc_secret = v_rpc_secret);
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  result jsonb;
begin
  if not v_authorized then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  if v_status is not null and v_status not in ('received_for_review','triaged','promoted','ignored','spam') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select jsonb_build_object(
    'ok', true,
    'count', count(*),
    'items', coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  ) into result
  from (
    select
      s.created_at,
      jsonb_build_object(
        'id', s.id,
        'eventId', s.event_id,
        'source', s.source,
        'sourceUrl', s.source_url,
        'receivedVia', s.received_via,
        'payloadFormat', s.payload_format,
        'submissionKind', s.submission_kind,
        'payload', s.payload,
        'payloadSizeChars', s.payload_size_chars,
        'urlsToReview', s.urls_to_review,
        'tags', s.tags,
        'submittedByPrivate', s.submitted_by_private,
        'contactPrivate', s.contact_private,
        'notePrivate', s.note_private,
        'warnings', s.warnings,
        'reviewStatus', s.review_status,
        'recommendedAction', s.recommended_action,
        'processedRecordKind', s.processed_record_kind,
        'processedRecordId', s.processed_record_id,
        'processedRecordUrl', s.processed_record_url,
        'processedAt', s.processed_at,
        'publicReviewNote', s.public_review_note,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      ) as item
    from public.public_data_intake_submissions s
    where (v_status is null or s.review_status = v_status)
      and (p_before is null or s.created_at < p_before)
    order by s.created_at desc, s.id desc
    limit v_limit
  ) q;

  return coalesce(result, jsonb_build_object('ok', true, 'count', 0, 'items', '[]'::jsonb));
end; $$;

revoke execute on function public.list_public_data_intake_submissions(
  text, int, timestamptz, text
) from public;
grant execute on function public.list_public_data_intake_submissions(
  text, int, timestamptz, text
) to anon, authenticated;

create or replace function public.review_public_data_intake_submission(
  p_id uuid,
  p_review_status text,
  p_recommended_action text default null,
  p_processed_record_kind text default null,
  p_processed_record_id text default null,
  p_processed_record_url text default null,
  p_public_review_note text default null,
  p_rpc_secret text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v_rpc_secret text := nullif(current_setting('app.public_intake_rpc_secret', true), '');
  v_authorized boolean := public.is_responder_coordinator(caller)
    or (v_rpc_secret is not null and p_rpc_secret is not null and p_rpc_secret = v_rpc_secret);
  v_status text := nullif(trim(coalesce(p_review_status, '')), '');
  v_action text := nullif(trim(coalesce(p_recommended_action, '')), '');
  v_kind text := nullif(trim(coalesce(p_processed_record_kind, '')), '');
  v_record_id text := nullif(trim(coalesce(p_processed_record_id, '')), '');
  v_record_url text := nullif(trim(coalesce(p_processed_record_url, '')), '');
  v_note text := nullif(trim(coalesce(p_public_review_note, '')), '');
  old_row public.public_data_intake_submissions%rowtype;
  new_row public.public_data_intake_submissions%rowtype;
begin
  if not v_authorized then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  if v_status is null or v_status not in ('received_for_review','triaged','promoted','ignored','spam') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if v_action is not null and v_action not in ('operator_triage','scrape_urls','review_person','review_entity','review_need','ignore') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;
  if v_kind is not null and v_kind not in ('person','entity','need','status','media','map_report','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_processed_record_kind');
  end if;
  if v_record_id is not null and length(v_record_id) > 160 then
    return jsonb_build_object('ok', false, 'error', 'invalid_processed_record_id');
  end if;
  if v_record_url is not null and (length(v_record_url) > 500 or v_record_url !~* '^https?://') then
    return jsonb_build_object('ok', false, 'error', 'invalid_processed_record_url');
  end if;
  if v_note is not null and length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_public_review_note');
  end if;

  select * into old_row
  from public.public_data_intake_submissions
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.public_data_intake_submissions
     set review_status = v_status,
         recommended_action = coalesce(
           v_action,
           case when v_status in ('ignored','spam') then 'ignore' else recommended_action end
         ),
         processed_record_kind = coalesce(v_kind, processed_record_kind),
         processed_record_id = coalesce(v_record_id, processed_record_id),
         processed_record_url = coalesce(v_record_url, processed_record_url),
         processed_at = case
           when v_status in ('promoted','ignored','spam') then now()
           else processed_at
         end,
         public_review_note = coalesce(v_note, public_review_note),
         updated_at = now()
   where id = p_id
   returning * into new_row;

  insert into public.moderation_log (
    entity_type, entity_id, action, previous_status, new_status, moderator_id, reason
  ) values (
    'public_data_intake_submission',
    p_id,
    'review',
    old_row.review_status,
    new_row.review_status,
    caller,
    v_note
  );

  return jsonb_build_object(
    'ok', true,
    'id', new_row.id,
    'previousStatus', old_row.review_status,
    'status', new_row.review_status,
    'recommendedAction', new_row.recommended_action,
    'processedAt', new_row.processed_at,
    'processedRecord', case
      when new_row.processed_record_kind is null and new_row.processed_record_id is null and new_row.processed_record_url is null then null
      else jsonb_build_object(
        'kind', new_row.processed_record_kind,
        'id', new_row.processed_record_id,
        'url', new_row.processed_record_url
      )
    end,
    'publicReviewNote', new_row.public_review_note
  );
end; $$;

revoke execute on function public.review_public_data_intake_submission(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function public.review_public_data_intake_submission(
  uuid, text, text, text, text, text, text, text
) to anon, authenticated;
