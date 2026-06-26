-- =====================================================================
-- 0011 — Crisis-hub expansion, slice 1: DONATION DIRECTORY (diaspora path)
--   * organizations  — vetted orgs to donate to (curated + community-suggested)
--   * donation_centers — physical drop-off points (community-submitted, vetted)
-- Reuses: moderation gate, fuzz_coord public views, submission_throttle rate
-- limiting, SECURITY DEFINER RPCs, moderation_log audit, coordinator gating.
-- (Skills<->needs marketplace is a separate later migration.)
-- =====================================================================

create type org_category as enum
  ('emergency_relief','donation','food','medical','find_people','mental_health',
   'news_info','shelter','legal','rescue','volunteer','other');
create type org_scope as enum ('internacional','en_venezuela','ambos');
create type org_status as enum ('suggested','active','inactive');
create type center_status as enum ('active','full','closed');
create type donation_item as enum
  ('agua_potable','alimentos','medicamentos','higiene','panales','abrigo_carpas',
   'herramientas_rescate','energia','apoyo_psicosocial','ropa','dinero','equipos_medicos','otro');

-- ---- organizations --------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,
  name          text not null,
  description   text,
  website_url   text,
  donation_url  text,
  category      org_category not null default 'other',
  scope         org_scope not null default 'ambos',
  is_in_country boolean not null default false,
  org_status    org_status not null default 'suggested',  -- user submissions start 'suggested'
  verified      boolean not null default false,
  suggested_by  uuid references auth.users(id),
  submitter_notes text,
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index organizations_category_idx on public.organizations (category);
create index organizations_status_idx on public.organizations (org_status);
create trigger trg_orgs_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

create view public.organizations_public with (security_invoker = off) as
  select id, slug, name, description, website_url, donation_url,
         category, scope, is_in_country, verified, created_at
  from public.organizations
  where org_status = 'active';
grant select on public.organizations_public to anon, authenticated;

alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;  -- coordinators read base via RLS
create policy organizations_select_coordinator on public.organizations
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- ---- donation_centers ----------------------------------------------
create table public.donation_centers (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  name          text not null,
  lat           double precision,
  lng           double precision,
  address       text,
  city          text,
  state_province text,
  country_code  text,                       -- 'VE','US','ES','CO'…
  contact_public_display text,              -- shown publicly (handle, public phone)
  contact_phone text,                       -- PRIVATE (coordinator only)
  contact_email text,                       -- PRIVATE
  social_handle text,
  hours_notes   text,
  accepts_items donation_item[],
  priority_items donation_item[],
  needs_notes   text,
  status        center_status not null default 'active',
  accepts_monetary boolean not null default false,
  monetary_url  text,
  last_verified_at timestamptz,
  moderation_status report_moderation_status not null default 'pending',
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz,
  flagged_count integer not null default 0,
  submitted_by  uuid references auth.users(id),
  is_sample_data boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index donation_centers_country_idx on public.donation_centers (country_code);
create index donation_centers_moderation_idx on public.donation_centers (moderation_status);
create trigger trg_centers_touch before update on public.donation_centers
  for each row execute function public.touch_updated_at();

create view public.donation_centers_public with (security_invoker = off) as
  select id, organization_id, name,
         public.fuzz_coord(lat) as lat, public.fuzz_coord(lng) as lng,
         city, state_province, country_code,
         contact_public_display, social_handle, hours_notes,
         accepts_items, priority_items, needs_notes,
         status, accepts_monetary, monetary_url, last_verified_at, created_at
  from public.donation_centers
  where moderation_status = 'approved' and status <> 'closed';
grant select on public.donation_centers_public to anon, authenticated;

alter table public.donation_centers enable row level security;
revoke all on public.donation_centers from anon, authenticated;
grant select on public.donation_centers to authenticated;
create policy centers_select_coordinator on public.donation_centers
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- ---- submission RPCs (rate-limited, land as pending/suggested) ------
create or replace function public.submit_organization(
  p_ip_hash text, p_name text, p_website_url text default null,
  p_donation_url text default null, p_category org_category default 'other',
  p_scope org_scope default 'ambos', p_is_in_country boolean default false,
  p_description text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare recent int; new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'organization' and created_at > now() - interval '1 hour';
  if recent >= 3 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.organizations (name, website_url, donation_url, category, scope,
      is_in_country, description, submitter_notes, suggested_by, org_status)
    values (p_name, p_website_url, p_donation_url, p_category, p_scope,
      coalesce(p_is_in_country,false), p_description, p_notes, auth.uid(), 'suggested')
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'organization');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'suggested');
end; $$;
revoke execute on function public.submit_organization(text,text,text,text,org_category,org_scope,boolean,text,text) from public;
grant execute on function public.submit_organization(text,text,text,text,org_category,org_scope,boolean,text,text) to anon, authenticated;

create or replace function public.submit_donation_center(
  p_ip_hash text, p_name text,
  p_lat double precision default null, p_lng double precision default null,
  p_address text default null, p_city text default null, p_state text default null,
  p_country_code text default null, p_contact_public text default null,
  p_social text default null, p_hours text default null,
  p_accepts donation_item[] default null, p_priority donation_item[] default null,
  p_needs text default null, p_accepts_monetary boolean default false, p_monetary_url text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare recent int; new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    return jsonb_build_object('ok', false, 'error', 'bad_coords');
  end if;
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'donation_center' and created_at > now() - interval '1 hour';
  if recent >= 2 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.donation_centers (name, lat, lng, address, city, state_province,
      country_code, contact_public_display, social_handle, hours_notes, accepts_items,
      priority_items, needs_notes, accepts_monetary, monetary_url, submitted_by, moderation_status)
    values (p_name, p_lat, p_lng, p_address, p_city, p_state, p_country_code, p_contact_public,
      p_social, p_hours, p_accepts, p_priority, p_needs, coalesce(p_accepts_monetary,false),
      p_monetary_url, auth.uid(), 'pending')
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'donation_center');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_donation_center(text,text,double precision,double precision,text,text,text,text,text,text,text,donation_item[],donation_item[],text,boolean,text) from public;
grant execute on function public.submit_donation_center(text,text,double precision,double precision,text,text,text,text,text,text,text,donation_item[],donation_item[],text,boolean,text) to anon, authenticated;

-- ---- coordinator moderation RPCs -----------------------------------
create or replace function public.promote_organization(p_org uuid, p_approve boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.organizations
    set org_status = case when p_approve then 'active' else 'inactive' end,
        verified = p_approve, moderated_by = auth.uid(), moderated_at = now(), updated_at = now()
    where id = p_org;
  get diagnostics c = row_count;
  if c > 0 then
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id)
      values ('organization', p_org, case when p_approve then 'promote' else 'reject' end,
              case when p_approve then 'active' else 'inactive' end, auth.uid());
  end if;
  return c > 0;
end; $$;
revoke execute on function public.promote_organization(uuid, boolean) from public, anon;
grant execute on function public.promote_organization(uuid, boolean) to authenticated;

create or replace function public.approve_donation_center(p_center uuid, p_approve boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.donation_centers
    set moderation_status = case when p_approve then 'approved' else 'rejected_spam' end,
        last_verified_at = case when p_approve then now() else last_verified_at end,
        moderated_by = auth.uid(), moderated_at = now(), updated_at = now()
    where id = p_center;
  get diagnostics c = row_count;
  if c > 0 then
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id)
      values ('donation_center', p_center, 'moderate',
              case when p_approve then 'approved' else 'rejected' end, auth.uid());
  end if;
  return c > 0;
end; $$;
revoke execute on function public.approve_donation_center(uuid, boolean) from public, anon;
grant execute on function public.approve_donation_center(uuid, boolean) to authenticated;

-- =====================================================================
-- SEED — 17 vetted organizations (curated; active + verified)
-- =====================================================================
insert into public.organizations (slug, name, description, website_url, donation_url, category, scope, is_in_country, org_status, verified) values
('gem','Global Empowerment Mission (GEM)','Respuesta rápida de emergencia y logística de ayuda.','https://www.globalempowermentmission.org/mission/venezuela-earthquake/','https://www.globalempowermentmission.org/mission/venezuela-earthquake/','emergency_relief','internacional',false,'active',true),
('we-love-foundation','We Love Foundation','Fundación 501(c)(3) (antes I Love Venezuela) que canaliza recursos a ONGs verificadas.','https://www.welove.foundation','https://www.welove.foundation','emergency_relief','internacional',false,'active',true),
('crs-caritas','Catholic Relief Services / Cáritas Venezuela','Ayuda humanitaria con presencia local a través de Cáritas.','https://www.crs.org/donate/venezuela-earthquake','https://www.crs.org/donate/venezuela-earthquake','emergency_relief','ambos',true,'active',true),
('jrs-usa','Jesuit Refugee Service USA','Respuesta de emergencia para personas desplazadas.','https://www.jrsusa.org/jrsusa-org-venezuela-earthquake-emergency/','https://www.jrsusa.org/jrsusa-org-venezuela-earthquake-emergency/','emergency_relief','internacional',false,'active',true),
('malteser','Malteser International','Ayuda médica y humanitaria de emergencia.','https://www.malteser-international.org/en/our-work/americas/earthquakes-in-venezuela-your-donation-helps.html','https://www.malteser-international.org/en/our-work/americas/earthquakes-in-venezuela-your-donation-helps.html','emergency_relief','internacional',false,'active',true),
('unicef-usa','UNICEF USA','Protección y ayuda para niños afectados.','https://www.unicefusa.org/stories/venezuela-earthquakes-children-need-help-now','https://www.unicefusa.org/stories/venezuela-earthquakes-children-need-help-now','emergency_relief','internacional',false,'active',true),
('globalgiving','GlobalGiving — Fondo Terremoto Venezuela','Fondo que distribuye a organizaciones locales verificadas.','https://www.globalgiving.org/projects/venezuela-earthquake-relief-fund/','https://www.globalgiving.org/projects/venezuela-earthquake-relief-fund/','donation','internacional',false,'active',true),
('wck','World Central Kitchen','Comidas calientes para personas afectadas por el desastre.','https://donate.wck.org','https://donate.wck.org','food','internacional',false,'active',true),
('vaccf','Venezuelan American Chamber of Commerce Foundation','Fundación de la cámara de comercio venezolano-americana.','https://vaccfoundation.org/donate-now/','https://vaccfoundation.org/donate-now/','emergency_relief','internacional',false,'active',true),
('irc','International Rescue Committee (IRC)','Respuesta humanitaria internacional.','https://www.rescue.org/article/how-help-survivors-earthquakes-venezuela','https://www.rescue.org/article/how-help-survivors-earthquakes-venezuela','emergency_relief','ambos',false,'active',true),
('direct-relief','Direct Relief','Suministros médicos y medicamentos de emergencia.','https://www.directrelief.org/emergency/venezuela-earthquakes-2026/','https://www.directrelief.org/emergency/venezuela-earthquakes-2026/','medical','internacional',false,'active',true),
('cruz-roja','Cruz Roja Venezolana / IFRC','Cruz Roja con presencia y operaciones dentro de Venezuela.','https://www.cruzroja.org.ve','https://www.cruzroja.org.ve','emergency_relief','ambos',true,'active',true),
('venezuela-te-busca','Venezuela Te Busca','Registro ciudadano para localizar personas desaparecidas tras el terremoto.','https://venezuela-te-busca-app.hellogafaro.workers.dev','https://venezuela-te-busca-app.hellogafaro.workers.dev','find_people','en_venezuela',true,'active',true),
('world-vision','World Vision','Ayuda de emergencia enfocada en familias y niñez.','https://donate.worldvision.org/give/disaster-relief','https://donate.worldvision.org/give/disaster-relief','emergency_relief','internacional',false,'active',true),
('save-the-children','Save the Children','Protección y ayuda de emergencia para la niñez.','https://www.savethechildren.es/donacion-ong/terremoto-en-venezuela-2026','https://www.savethechildren.es/donacion-ong/terremoto-en-venezuela-2026','emergency_relief','ambos',false,'active',true),
('project-hope','Project HOPE','Atención y suministros médicos de emergencia.','https://www.projecthope.org/news-stories/responses/earthquakes-in-venezuela-how-to-help/','https://www.projecthope.org/news-stories/responses/earthquakes-in-venezuela-how-to-help/','medical','internacional',false,'active',true),
('islamic-relief','Islamic Relief','Ayuda humanitaria de emergencia.','https://www.islamic-relief.org/appeals/venezuela-earthquake/','https://www.islamic-relief.org/appeals/venezuela-earthquake/','emergency_relief','internacional',false,'active',true);
