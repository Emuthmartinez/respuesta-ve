import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';

// Reusable safety banner. Community reports/placards are coordination aids,
// NOT official structural certifications.
export function Disclaimer({ locale = 'es', className = '' }: { locale?: Locale; className?: string }) {
  const d = t(locale).disclaimer;
  return (
    <div
      className={`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
    >
      <strong>{d.label}</strong> {d.text}{' '}
      <strong>{d.number}</strong> {d.suffix}
    </div>
  );
}
