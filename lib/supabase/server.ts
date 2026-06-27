import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabasePublicConfig } from './client';

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

// Server-side Supabase client (reads auth from cookies). Null when unconfigured.
export async function getSupabaseServer() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll can be called from a Server Component — safe to ignore.
        }
      },
    },
  });
}
