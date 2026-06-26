import Link from 'next/link';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requestStatusSkills } from '@/lib/skills';
import { getLocale } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

const STR = {
  es: {
    heading: 'Estado de tu solicitud',
    not_found: 'No encontramos una solicitud con este código.',
    hint: 'Guarda este enlace para volver a consultar. Un coordinador te conectará con un voluntario verificado de forma privada.',
    back: 'Volver al intercambio',
  },
  en: {
    heading: 'Your request status',
    not_found: 'We could not find a request with this code.',
    hint: 'Save this link to check again later. A coordinator will connect you with a verified volunteer privately.',
    back: 'Back to the exchange',
  },
} as const;

export default async function AyudaStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const s = STR[locale];
  const tokenHash = createHash('sha256').update(token).digest('hex');

  let status: string | null = null;
  const sb = await getSupabaseServer();
  if (sb) {
    const res = await sb.rpc('get_help_request_status', { p_token_hash: tokenHash });
    status = (res.data as string | null) ?? null;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{s.heading}</h1>
      {status ? (
        <p className="mt-3 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/10">
          {requestStatusSkills(status, locale)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">{s.not_found}</p>
      )}
      <p className="mt-4 text-xs text-zinc-500">
        {s.hint}
      </p>
      <Link href="/intercambio" className="mt-6 inline-block text-sm text-red-600 underline">
        {s.back}
      </Link>
    </div>
  );
}
