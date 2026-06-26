'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { ManageLink } from '@/components/ManageLink';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const STR = {
  es: {
    heading: 'Reportar desinformación',
    subtext: 'Ayúdanos a identificar contenido falso o engañoso relacionado con el terremoto. Un coordinador lo revisará antes de publicarlo.',
    claimLabel: 'Contenido falso o engañoso *',
    claimPlaceholder: 'Describe brevemente el video, foto o noticia falsa…',
    sourceUrlLabel: 'Enlace al contenido original *',
    sourceUrlPlaceholder: 'https://…',
    verdictLabel: 'Tipo de desinformación',
    verdictFalse: 'Falso',
    verdictMisleading: 'Engañoso',
    verdictUnverified: 'No verificado',
    verdictSatire: 'Sátira',
    explanationLabel: 'Explicación',
    explanationPlaceholder: '¿Por qué es falso o engañoso?',
    debunkUrlLabel: 'Enlace a la verificación (opcional)',
    debunkUrlPlaceholder: 'https://…',
    relatedPlaceLabel: 'Lugar relacionado (opcional)',
    relatedPlacePlaceholder: 'Ej. Caracas, Maracaibo…',
    severityLabel: 'Impacto',
    severityLow: 'Bajo',
    severityMedium: 'Medio',
    severityHigh: 'Alto',
    submit: 'Enviar reporte',
    submitting: 'Enviando…',
    successHeading: 'Reporte enviado',
    successText: 'Gracias. Un coordinador la revisará antes de publicarla.',
    backToList: 'Volver a desmentidos',
    errClaimRequired: 'Describe el contenido falso (mínimo 5 caracteres).',
    errSourceRequired: 'Indica el enlace al contenido original.',
    errRateLimited: 'Has enviado demasiados reportes. Intenta más tarde.',
    errGeneric: 'No se pudo enviar el reporte.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'Report misinformation',
    subtext: 'Help us identify false or misleading content related to the earthquake. A coordinator will review it before publishing.',
    claimLabel: 'False or misleading content *',
    claimPlaceholder: 'Briefly describe the false video, photo, or news item…',
    sourceUrlLabel: 'Link to the original content *',
    sourceUrlPlaceholder: 'https://…',
    verdictLabel: 'Type of misinformation',
    verdictFalse: 'False',
    verdictMisleading: 'Misleading',
    verdictUnverified: 'Unverified',
    verdictSatire: 'Satire',
    explanationLabel: 'Explanation',
    explanationPlaceholder: 'Why is it false or misleading?',
    debunkUrlLabel: 'Link to fact-check (optional)',
    debunkUrlPlaceholder: 'https://…',
    relatedPlaceLabel: 'Related place (optional)',
    relatedPlacePlaceholder: 'e.g. Caracas, Maracaibo…',
    severityLabel: 'Impact',
    severityLow: 'Low',
    severityMedium: 'Medium',
    severityHigh: 'High',
    submit: 'Submit report',
    submitting: 'Submitting…',
    successHeading: 'Report submitted',
    successText: 'Thank you. A coordinator will review it before publishing.',
    backToList: 'Back to fact-checks',
    errClaimRequired: 'Describe the false content (minimum 5 characters).',
    errSourceRequired: 'Please provide the link to the original content.',
    errRateLimited: 'You have submitted too many reports. Try again later.',
    errGeneric: 'Could not submit the report.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function ReportarDesinformacionPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [claim, setClaim] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [verdict, setVerdict] = useState<'false' | 'misleading' | 'unverified' | 'satire'>('unverified');
  const [explanation, setExplanation] = useState('');
  const [debunkUrl, setDebunkUrl] = useState('');
  const [relatedPlace, setRelatedPlace] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (claim.trim().length < 5) {
      setErr(s.errClaimRequired);
      return;
    }
    if (sourceUrl.trim().length < 7) {
      setErr(s.errSourceRequired);
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/misinfo/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: claim.trim(),
          verdict,
          explanation: explanation.trim() || null,
          source_url: sourceUrl.trim(),
          debunk_url: debunkUrl.trim() || null,
          related_place: relatedPlace.trim() || null,
          severity,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus('error');
        setErr(
          json.error === 'rate_limited'
            ? s.errRateLimited
            : json.error === 'claim_required'
            ? s.errClaimRequired
            : json.error === 'source_url_required'
            ? s.errSourceRequired
            : json.error || s.errGeneric,
        );
        return;
      }
      if (json.token) setToken(json.token);
      setStatus('success');
    } catch {
      setStatus('error');
      setErr(s.errNetwork);
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{s.successHeading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {s.successText}
        </p>
        {token && <ManageLink token={token} />}
        <Link
          href="/desmentidos"
          className="mt-6 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          {s.backToList}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{s.claimLabel}</label>
          <textarea
            className={field}
            rows={3}
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder={s.claimPlaceholder}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.sourceUrlLabel}</label>
          <input
            className={field}
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder={s.sourceUrlPlaceholder}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.verdictLabel}</label>
            <select
              className={field}
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as typeof verdict)}
            >
              <option value="false">{s.verdictFalse}</option>
              <option value="misleading">{s.verdictMisleading}</option>
              <option value="unverified">{s.verdictUnverified}</option>
              <option value="satire">{s.verdictSatire}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{s.severityLabel}</label>
            <select
              className={field}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
            >
              <option value="low">{s.severityLow}</option>
              <option value="medium">{s.severityMedium}</option>
              <option value="high">{s.severityHigh}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.explanationLabel}</label>
          <textarea
            className={field}
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder={s.explanationPlaceholder}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.debunkUrlLabel}</label>
          <input
            className={field}
            type="url"
            value={debunkUrl}
            onChange={(e) => setDebunkUrl(e.target.value)}
            placeholder={s.debunkUrlPlaceholder}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.relatedPlaceLabel}</label>
          <input
            className={field}
            value={relatedPlace}
            onChange={(e) => setRelatedPlace(e.target.value)}
            placeholder={s.relatedPlacePlaceholder}
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {status === 'submitting' ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
