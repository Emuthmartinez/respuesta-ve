'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { ManageLink } from '@/components/ManageLink';
import { orgCategoryLabel, orgScopeLabel, ORG_CATEGORY_LABEL, ORG_SCOPE_LABEL } from '@/lib/orgs';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const ORG_CATEGORIES = Object.keys(ORG_CATEGORY_LABEL);
const ORG_SCOPES = Object.keys(ORG_SCOPE_LABEL);

const STR = {
  es: {
    heading: 'Sugerir una organización',
    subtext: 'Sugiere una organización que conozcas. Un coordinador la revisará antes de publicarla.',
    nameLabel: 'Nombre de la organización *',
    websiteLabel: 'Sitio web',
    websitePlaceholder: 'https://…',
    donationLabel: 'Enlace para donar',
    donationPlaceholder: 'https://…',
    categoryLabel: 'Categoría',
    scopeLabel: 'Alcance',
    inCountryLabel: 'Opera dentro de Venezuela',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Breve descripción de la organización y su misión…',
    notesLabel: 'Notas adicionales (opcional)',
    notesPlaceholder: 'Cualquier información extra que consideres útil…',
    submit: 'Enviar sugerencia',
    submitting: 'Enviando…',
    successHeading: 'Sugerencia enviada',
    successText: 'Un coordinador la revisará antes de publicarla.',
    backToOutside: 'Volver a ayuda internacional',
    errNameRequired: 'Indica el nombre de la organización.',
    errRateLimited: 'Has enviado demasiadas sugerencias. Intenta más tarde.',
    errNameTooShort: 'El nombre debe tener al menos 2 caracteres.',
    errGeneric: 'No se pudo enviar.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'Suggest an organization',
    subtext: 'Suggest an organization you know about. A coordinator will review it before publishing.',
    nameLabel: 'Organization name *',
    websiteLabel: 'Website',
    websitePlaceholder: 'https://…',
    donationLabel: 'Donation link',
    donationPlaceholder: 'https://…',
    categoryLabel: 'Category',
    scopeLabel: 'Scope',
    inCountryLabel: 'Operates inside Venezuela',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Brief description of the organization and its mission…',
    notesLabel: 'Additional notes (optional)',
    notesPlaceholder: 'Any extra information you think is useful…',
    submit: 'Submit suggestion',
    submitting: 'Submitting…',
    successHeading: 'Suggestion submitted',
    successText: 'A coordinator will review it before publishing.',
    backToOutside: 'Back to international help',
    errNameRequired: 'Please enter the organization name.',
    errRateLimited: 'You have submitted too many suggestions. Try again later.',
    errNameTooShort: 'Name must be at least 2 characters.',
    errGeneric: 'Could not submit.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function SugerirOrganizacionPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [donationUrl, setDonationUrl] = useState('');
  const [category, setCategory] = useState('donation');
  const [scope, setScope] = useState('ambos');
  const [isInCountry, setIsInCountry] = useState(false);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (name.trim().length < 2) {
      setErr(s.errNameTooShort);
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/org/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          website_url: websiteUrl || null,
          donation_url: donationUrl || null,
          category,
          scope,
          is_in_country: isInCountry,
          description: description || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus('error');
        const errorMap: Record<string, string> = {
          rate_limited: s.errRateLimited,
          name_required: s.errNameRequired,
        };
        setErr(errorMap[json.error] ?? json.error ?? s.errGeneric);
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
        <Link href="/afuera" className="mt-6 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
          {s.backToOutside}
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
          <label className="mb-1 block text-sm font-medium">{s.nameLabel}</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.websiteLabel}</label>
            <input className={field} type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder={s.websitePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.donationLabel}</label>
            <input className={field} type="url" value={donationUrl} onChange={(e) => setDonationUrl(e.target.value)} placeholder={s.donationPlaceholder} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.categoryLabel}</label>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              {ORG_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {orgCategoryLabel(cat, locale)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.scopeLabel}</label>
            <select className={field} value={scope} onChange={(e) => setScope(e.target.value)}>
              {ORG_SCOPES.map((sc) => (
                <option key={sc} value={sc}>
                  {orgScopeLabel(sc, locale)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is_in_country"
            type="checkbox"
            checked={isInCountry}
            onChange={(e) => setIsInCountry(e.target.checked)}
            className="h-4 w-4 rounded border-black/20 accent-red-600"
          />
          <label htmlFor="is_in_country" className="text-sm font-medium">{s.inCountryLabel}</label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.descriptionLabel}</label>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={s.descriptionPlaceholder} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.notesLabel}</label>
          <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={s.notesPlaceholder} />
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
