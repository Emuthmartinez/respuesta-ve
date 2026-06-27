import { createBrowserClient } from '@supabase/ssr';

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

declare global {
  interface Window {
    __RESPUESTA_SUPABASE_CONFIG__?: SupabasePublicConfig;
  }
}

function getInjectedConfig(): SupabasePublicConfig | null {
  if (typeof window === 'undefined') return null;
  return window.__RESPUESTA_SUPABASE_CONFIG__ ?? null;
}

// Returns a browser Supabase client, or null when env isn't configured yet.
// Null lets the UI fall back to sample data so the app runs pre-provision.
export function getSupabaseBrowser(config?: SupabasePublicConfig | null) {
  const runtimeConfig = config ?? getInjectedConfig();
  const url = runtimeConfig?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeConfig?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
