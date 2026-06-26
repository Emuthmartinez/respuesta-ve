import Link from 'next/link';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { REQUEST_STATUS_ES } from '@/lib/skills';

export const dynamic = 'force-dynamic';

export default async function AyudaStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  let status: string | null = null;
  const sb = await getSupabaseServer();
  if (sb) {
    const res = await sb.rpc('get_help_request_status', { p_token_hash: tokenHash });
    status = (res.data as string | null) ?? null;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Estado de tu solicitud</h1>
      {status ? (
        <p className="mt-3 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/10">
          {REQUEST_STATUS_ES[status] ?? status}
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No encontramos una solicitud con este código.</p>
      )}
      <p className="mt-4 text-xs text-zinc-500">
        Guarda este enlace para volver a consultar. Un coordinador te conectará con
        un voluntario verificado de forma privada.
      </p>
      <Link href="/intercambio" className="mt-6 inline-block text-sm text-red-600 underline">
        Volver al intercambio
      </Link>
    </div>
  );
}
