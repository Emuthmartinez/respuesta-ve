import Link from 'next/link';
import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n-server';
import { entityLabel, statusCopy } from '@/lib/manage';
import { ManageActions } from '@/components/ManageActions';

export const dynamic = 'force-dynamic';

const STR = {
  es: {
    heading: 'Gestiona tu envío',
    intro: 'Esta página es privada: solo quien tiene este enlace puede verla. Guárdalo.',
    submitted: 'Enviado',
    notFound: 'No encontramos ningún envío con este enlace. Puede que el enlace esté incompleto o que el envío ya se haya eliminado.',
    back: 'Volver al inicio',
    type: 'Tipo',
    state: 'Estado',
  },
  en: {
    heading: 'Manage your submission',
    intro: 'This page is private: only someone with this link can see it. Keep it safe.',
    submitted: 'Submitted',
    notFound: 'We could not find any submission for this link. The link may be incomplete, or the submission was already removed.',
    back: 'Back to home',
    type: 'Type',
    state: 'Status',
  },
} as const;

type Lookup = {
  ok: boolean;
  entity?: string;
  id?: string;
  status?: string;
  created_at?: string;
  retracted?: boolean;
  pending_review?: boolean;
  life_safety?: boolean;
  place?: string;
  error?: string;
};

export default async function GestionarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const s = STR[locale];
  const tokenHash = createHash('sha256').update(token).digest('hex');

  let info: Lookup = { ok: false };
  const sb = await getSupabaseServer();
  if (sb) {
    const { data } = await sb.rpc('lookup_submission', { p_token_hash: tokenHash });
    info = (data as Lookup) ?? { ok: false };
  }

  if (!info.ok || !info.entity || !info.id) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{s.heading}</h1>
        <p className="mt-3 text-sm text-zinc-500">{s.notFound}</p>
        <Link href="/" className="mt-6 inline-block text-sm text-red-600 underline">{s.back}</Link>
      </div>
    );
  }

  const sc = statusCopy(info.status ?? 'pending', {
    retracted: !!info.retracted,
    pendingReview: !!info.pending_review,
  }, locale);
  const created = info.created_at ? new Date(info.created_at).toLocaleString(locale === 'es' ? 'es-VE' : 'en-US') : '';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">{s.heading}</h1>
      <p className="mt-2 text-xs text-zinc-500">{s.intro}</p>

      <div className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">{s.type}</dt>
            <dd className="text-right font-medium">{entityLabel(info.entity, locale)}</dd>
          </div>
          {info.place && (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">·</dt>
              <dd className="text-right text-zinc-600 dark:text-zinc-400">{info.place}</dd>
            </div>
          )}
          {created && (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">{s.submitted}</dt>
              <dd className="text-right text-zinc-600 dark:text-zinc-400">{created}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">{s.state}</dt>
            <dd
              className={`text-right font-medium ${
                sc.kind === 'live' ? 'text-emerald-600' : sc.kind === 'retracted' || sc.kind === 'closed' ? 'text-zinc-500' : 'text-amber-600'
              }`}
            >
              {sc.text}
            </dd>
          </div>
        </dl>
      </div>

      <ManageActions
        token={token}
        entity={info.entity}
        id={info.id}
        alreadyRetracted={!!info.retracted || sc.kind === 'retracted'}
        pendingReview={!!info.pending_review}
        lifeSafety={!!info.life_safety}
        locale={locale}
      />

      <Link href="/" className="mt-6 inline-block text-sm text-red-600 underline">{s.back}</Link>
    </div>
  );
}
