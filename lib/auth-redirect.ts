const ALLOWED_AUTH_NEXT = new Set([
  '/voluntarios',
  '/voluntarios/cola',
  '/voluntarios/registrarse',
  '/voluntarios/moderacion',
  '/voluntarios/responders',
  '/desarrolladores/claves',
]);

const AUTH_FALLBACK_BY_NEXT = new Map([
  ['/desarrolladores/claves', '/desarrolladores/acceder'],
]);

export function normalizeAuthNext(rawNext?: string | null) {
  return rawNext && ALLOWED_AUTH_NEXT.has(rawNext) ? rawNext : '/voluntarios';
}

export function authFallbackForNext(nextPath: string) {
  return AUTH_FALLBACK_BY_NEXT.get(nextPath) ?? '/voluntarios';
}

export function withAuthError(path: string, error = 'auth') {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}error=${encodeURIComponent(error)}`;
}
