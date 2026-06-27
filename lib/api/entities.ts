// Public-safe federation helpers for hospitals, shelters, orgs, needs, channels,
// and partner badges. These never expose private coordinator fields or raw
// partner API-key data.

import type { SupabaseClient } from '@supabase/supabase-js';

export const ENTITY_SELECT =
  'id, entity_kind, name, description, estado, municipio, lat, lng, source, source_url, last_verified_at, source_updated_at, created_at, updated_at, audience_scope, country_code';
const CHANNEL_SELECT =
  'id, entity_id, channel_type, label, url, display_text, instructions, is_primary, source_updated_at, created_at, updated_at';
const NEED_SELECT =
  'id, entity_id, need_category, title, description, urgency, status, quantity, unit, source_updated_at, expires_at, created_at, updated_at';

export interface EntityRow {
  id: string;
  entity_kind: string;
  name: string;
  description: string | null;
  estado: string | null;
  municipio: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  source_url: string;
  last_verified_at: string | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
  audience_scope: string | null;
  country_code: string | null;
}

interface ChannelRow {
  id: string;
  entity_id: string;
  channel_type: string;
  label: string | null;
  url: string | null;
  display_text: string | null;
  instructions: string | null;
  is_primary: boolean;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NeedRow {
  id: string;
  entity_id: string;
  need_category: string;
  title: string;
  description: string | null;
  urgency: string;
  status: string;
  quantity: number | null;
  unit: string | null;
  source_updated_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface PublicChannel {
  id: string;
  type: string;
  label: string | null;
  url: string | null;
  displayText: string | null;
  instructions: string | null;
  isPrimary: boolean;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}

export interface PublicNeed {
  id: string;
  category: string;
  title: string;
  description: string | null;
  urgency: string;
  status: string;
  quantity: number | null;
  unit: string | null;
  sourceUpdatedAt: string | null;
  expiresAt: string;
  updatedAt: string;
}

export interface PublicEntity {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  estado: string | null;
  municipio: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  sourceUrl: string;
  lastVerifiedAt: string | null;
  sourceUpdatedAt: string | null;
  updatedAt: string;
  audienceScope: string | null;
  countryCode: string | null;
  channels: PublicChannel[];
  needs: PublicNeed[];
}

export function normalizeDomain(raw: string): string | null {
  const input = raw.trim().toLowerCase();
  const urlish = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const host = new URL(urlish).hostname.replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function redactEntity(row: EntityRow, channels: ChannelRow[], needs: NeedRow[]): PublicEntity {
  return {
    id: row.id,
    kind: row.entity_kind,
    name: row.name,
    description: row.description,
    estado: row.estado,
    municipio: row.municipio,
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    sourceUrl: row.source_url,
    lastVerifiedAt: row.last_verified_at,
    sourceUpdatedAt: row.source_updated_at,
    updatedAt: row.updated_at,
    audienceScope: row.audience_scope,
    countryCode: row.country_code,
    channels: channels.map((c) => ({
      id: c.id,
      type: c.channel_type,
      label: c.label,
      url: c.url,
      displayText: c.display_text,
      instructions: c.instructions,
      isPrimary: c.is_primary,
      sourceUpdatedAt: c.source_updated_at,
      updatedAt: c.updated_at,
    })),
    needs: needs.map((n) => ({
      id: n.id,
      category: n.need_category,
      title: n.title,
      description: n.description,
      urgency: n.urgency,
      status: n.status,
      quantity: n.quantity,
      unit: n.unit,
      sourceUpdatedAt: n.source_updated_at,
      expiresAt: n.expires_at,
      updatedAt: n.updated_at,
    })),
  };
}

async function hydrateEntities(sb: SupabaseClient, rows: EntityRow[]): Promise<PublicEntity[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [{ data: channelData, error: channelError }, { data: needData, error: needError }] = await Promise.all([
    sb.from('coordination_entity_channels_public').select(CHANNEL_SELECT).in('entity_id', ids),
    sb.from('coordination_entity_needs_public').select(NEED_SELECT).in('entity_id', ids),
  ]);
  if (channelError || needError) throw new Error('entity_hydration_failed');
  const channels = ((channelData as ChannelRow[]) ?? []).reduce<Record<string, ChannelRow[]>>((acc, row) => {
    (acc[row.entity_id] ||= []).push(row);
    return acc;
  }, {});
  const needs = ((needData as NeedRow[]) ?? []).reduce<Record<string, NeedRow[]>>((acc, row) => {
    (acc[row.entity_id] ||= []).push(row);
    return acc;
  }, {});
  return rows.map((row) => redactEntity(row, channels[row.id] ?? [], needs[row.id] ?? []));
}

export async function searchEntities(
  sb: SupabaseClient,
  opts: {
    q?: string | null;
    kind?: string | null;
    estado?: string | null;
    audienceScope?: string | null;
    countryCode?: string | null;
    limit: number;
  },
): Promise<PublicEntity[]> {
  let query = sb.from('coordination_entities_public').select(ENTITY_SELECT);
  if (opts.q) {
    const q = opts.q.replace(/[%,()]/g, '');
    if (q.length < 2) return [];
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (opts.kind) query = query.eq('entity_kind', opts.kind);
  if (opts.estado) query = query.eq('estado', opts.estado);
  if (opts.audienceScope) query = query.eq('audience_scope', opts.audienceScope);
  if (opts.countryCode) query = query.eq('country_code', opts.countryCode);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(opts.limit);
  if (error) throw new Error('entity_search_failed');
  return hydrateEntities(sb, (data as EntityRow[]) ?? []);
}

export async function entityChangesSince(
  sb: SupabaseClient,
  opts: { since: string; limit: number },
): Promise<PublicEntity[]> {
  const { data, error } = await sb
    .from('coordination_entities_public')
    .select(ENTITY_SELECT)
    .gt('updated_at', opts.since)
    .order('updated_at', { ascending: true })
    .limit(opts.limit);
  if (error) throw new Error('entity_changes_failed');
  return hydrateEntities(sb, (data as EntityRow[]) ?? []);
}

export async function verifyBadge(sb: SupabaseClient, domain: string) {
  const { data, error } = await sb
    .from('partner_badges_public')
    .select('name, source, verified_domains, badge_label, badge_verified_at')
    .contains('verified_domains', [domain])
    .limit(1);
  if (error) throw new Error('badge_lookup_failed');
  const row = (data as {
    name: string; source: string; verified_domains: string[];
    badge_label: string; badge_verified_at: string | null;
  }[] | null)?.[0];
  if (!row) return { verified: false as const, domain };
  return {
    verified: true as const,
    domain,
    partnerName: row.name,
    source: row.source,
    badgeLabel: row.badge_label,
    verifiedAt: row.badge_verified_at,
  };
}
