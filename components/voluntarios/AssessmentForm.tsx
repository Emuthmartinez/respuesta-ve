'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { PLACARD_OPTIONS, HAZARD_CATEGORIES, HAZARD_GRADES, DAMAGE_PCT } from '@/lib/responder';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    verdict: 'Dictamen *',
    assessmentType: 'Tipo de evaluación',
    rapid: 'Rápida (exterior)',
    detailed: 'Detallada (interior)',
    scope: 'Alcance',
    exteriorOnly: 'Solo exterior',
    exteriorAndInterior: 'Exterior e interior',
    hazards: 'Peligros observados',
    damagePct: 'Daño estimado (%)',
    detailedEval: 'Evaluación detallada',
    notNeeded: 'No requerida',
    recommended: 'Recomendada',
    required: 'Requerida',
    useRestrictions: 'Restricciones de uso',
    useRestrictionsPlaceholder: 'Ej: prohibido el acceso al 3er piso',
    barricade: 'Requiere barricada',
    gasShutoff: 'Gas cerrado/confirmado',
    license: 'N.º de licencia/CIV (para el cartel)',
    structuralNotes: 'Notas estructurales',
    disclaimerText:
      'Confirmo que esta es una evaluación comunitaria de coordinación, no una certificación oficial, y que debe coordinarse con Protección Civil/Bomberos.',
    disclaimerStrong: 'evaluación comunitaria de coordinación',
    errNoVerdict: 'Selecciona un dictamen (verde/amarillo/rojo).',
    errNoDisclaimer: 'Debes confirmar el aviso de evaluación comunitaria.',
    errNoDb: 'La base de datos no está conectada.',
    submitting: 'Enviando…',
    submit: 'Emitir evaluación',
  },
  en: {
    verdict: 'Verdict *',
    assessmentType: 'Assessment type',
    rapid: 'Rapid (exterior)',
    detailed: 'Detailed (interior)',
    scope: 'Scope',
    exteriorOnly: 'Exterior only',
    exteriorAndInterior: 'Exterior and interior',
    hazards: 'Observed hazards',
    damagePct: 'Estimated damage (%)',
    detailedEval: 'Detailed evaluation',
    notNeeded: 'Not needed',
    recommended: 'Recommended',
    required: 'Required',
    useRestrictions: 'Use restrictions',
    useRestrictionsPlaceholder: 'E.g.: no access to 3rd floor',
    barricade: 'Requires barricade',
    gasShutoff: 'Gas shut off/confirmed',
    license: 'License/CIV no. (for the placard)',
    structuralNotes: 'Structural notes',
    disclaimerText:
      'I confirm this is a community coordination assessment, not an official certification, and must be coordinated with Civil Protection/Fire Department.',
    disclaimerStrong: 'community coordination assessment',
    errNoVerdict: 'Select a verdict (green/yellow/red).',
    errNoDisclaimer: 'You must confirm the community assessment notice.',
    errNoDb: 'Database is not connected.',
    submitting: 'Submitting…',
    submit: 'Submit assessment',
  },
} as const;

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const SAFE_BY_PLACARD: Record<string, boolean> = {
  green_inspected: true,
  yellow_restricted: false,
  red_unsafe: false,
};

export function AssessmentForm({
  uid,
  buildingId,
  requestId,
}: {
  uid: string;
  buildingId: string;
  requestId: string | null;
}) {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  const [placard, setPlacard] = useState('');
  const [assessmentType, setAssessmentType] = useState('rapid');
  const [scope, setScope] = useState('exterior_only');
  const [hazards, setHazards] = useState<Record<string, string>>({});
  const [damagePct, setDamagePct] = useState('');
  const [useRestrictions, setUseRestrictions] = useState('');
  const [barricade, setBarricade] = useState(false);
  const [gasShutoff, setGasShutoff] = useState(false);
  const [detailed, setDetailed] = useState('not_needed');
  const [license, setLicense] = useState('');
  const [notes, setNotes] = useState('');
  const [disclaimer, setDisclaimer] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (!placard) {
      setErr(s.errNoVerdict);
      return;
    }
    if (!disclaimer) {
      setErr(s.errNoDisclaimer);
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) {
      setErr(s.errNoDb);
      return;
    }
    setSaving(true);
    const { error } = await sb.from('assessments').insert({
      building_id: buildingId,
      inspection_request_id: requestId,
      responder_id: uid,
      placard,
      safe_to_enter: SAFE_BY_PLACARD[placard] ?? null,
      assessment_type: assessmentType,
      inspection_scope: scope,
      hazard_collapse: hazards.hazard_collapse ?? null,
      hazard_leaning: hazards.hazard_leaning ?? null,
      hazard_racking: hazards.hazard_racking ?? null,
      hazard_falling: hazards.hazard_falling ?? null,
      hazard_geotechnical: hazards.hazard_geotechnical ?? null,
      estimated_damage_pct: damagePct || null,
      use_restrictions: useRestrictions || null,
      barricade_needed: barricade,
      gas_shutoff_confirmed: gasShutoff,
      detailed_evaluation_recommended: detailed,
      reinspection_recommended: detailed !== 'not_needed',
      inspector_license_number: license || null,
      structural_notes: notes || null,
      community_disclaimer_accepted: true,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push('/voluntarios/cola');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">{s.verdict}</label>
        <div className="space-y-2">
          {PLACARD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPlacard(p.value)}
              className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                placard === p.value ? 'border-red-500 ring-1 ring-red-500' : 'border-black/15 dark:border-white/15'
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.color }} />
              {tr(p.label, locale)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">{s.assessmentType}</label>
          <select className={field} value={assessmentType} onChange={(e) => setAssessmentType(e.target.value)}>
            <option value="rapid">{s.rapid}</option>
            <option value="detailed">{s.detailed}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.scope}</label>
          <select className={field} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="exterior_only">{s.exteriorOnly}</option>
            <option value="exterior_and_interior">{s.exteriorAndInterior}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">{s.hazards}</label>
        <div className="space-y-2">
          {HAZARD_CATEGORIES.map((h) => (
            <div key={h.key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{tr(h.label, locale)}</span>
              <select
                className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-900"
                value={hazards[h.key] ?? 'none'}
                onChange={(e) => setHazards((prev) => ({ ...prev, [h.key]: e.target.value }))}
              >
                {HAZARD_GRADES.map((g) => <option key={g.value} value={g.value}>{tr(g.label, locale)}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">{s.damagePct}</label>
          <select className={field} value={damagePct} onChange={(e) => setDamagePct(e.target.value)}>
            <option value="">—</option>
            {DAMAGE_PCT.map((d) => <option key={d} value={d}>{d}%</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.detailedEval}</label>
          <select className={field} value={detailed} onChange={(e) => setDetailed(e.target.value)}>
            <option value="not_needed">{s.notNeeded}</option>
            <option value="recommended">{s.recommended}</option>
            <option value="required">{s.required}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{s.useRestrictions}</label>
        <input className={field} value={useRestrictions} onChange={(e) => setUseRestrictions(e.target.value)} placeholder={s.useRestrictionsPlaceholder} />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={barricade} onChange={(e) => setBarricade(e.target.checked)} />
          {s.barricade}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={gasShutoff} onChange={(e) => setGasShutoff(e.target.checked)} />
          {s.gasShutoff}
        </label>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{s.license}</label>
        <input className={field} value={license} onChange={(e) => setLicense(e.target.value)} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{s.structuralNotes}</label>
        <textarea className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        <input type="checkbox" className="mt-0.5" checked={disclaimer} onChange={(e) => setDisclaimer(e.target.checked)} />
        <span>
          {locale === 'es' ? (
            <>Confirmo que esta es una <strong>evaluación comunitaria de coordinación</strong>, no una certificación oficial, y que debe coordinarse con Protección Civil/Bomberos.</>
          ) : (
            <>I confirm this is a <strong>community coordination assessment</strong>, not an official certification, and must be coordinated with Civil Protection/Fire Department.</>
          )}
        </span>
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={saving || !disclaimer}
        className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {saving ? s.submitting : s.submit}
      </button>
    </form>
  );
}
