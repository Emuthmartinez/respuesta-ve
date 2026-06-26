import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { CREDENTIAL_LABEL, TIER_LABEL, VERIFICATION_LABEL } from '@/lib/responder';
import { SignOutButton } from '@/components/voluntarios/SignOutButton';

export const metadata: Metadata = { title: 'Voluntarios — Respuesta VE' };

export default async function VoluntariosPage() {
  const { user, responder } = await getResponderProfile();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Voluntarios y responders</h1>

      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          La base de datos aún no está conectada en este entorno.
        </p>
      )}

      {/* Not signed in */}
      {!user && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Si tienes credenciales para evaluar estructuras o apoyar en la
            emergencia, regístrate y verifica tus credenciales para atender
            solicitudes de inspección. Solo responders verificados ven
            ubicaciones precisas.
          </p>
          <Link href="/voluntarios/acceder" className="inline-block rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
            Acceder / Registrarme
          </Link>
        </div>
      )}

      {/* Signed in, no profile yet */}
      {user && !responder && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tu sesión está activa. Completa tu perfil de responder para
            solicitar verificación.
          </p>
          <div className="flex items-center gap-3">
            <Link href="/voluntarios/registrarse" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
              Completar registro
            </Link>
            <SignOutButton />
          </div>
        </div>
      )}

      {/* Signed in with a profile */}
      {user && responder && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{responder.full_name}</div>
                <div className="text-sm text-zinc-500">{CREDENTIAL_LABEL[responder.credential_type]}</div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  responder.suspended_at
                    ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                    : responder.verification === 'verified'
                      ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                      : responder.verification === 'rejected'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                {responder.suspended_at ? 'Suspendido' : VERIFICATION_LABEL[responder.verification]}
                {' · '}
                {TIER_LABEL[responder.tier]}
              </span>
            </div>
          </div>

          {responder.suspended_at && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Tu cuenta está suspendida. Contacta a un coordinador.
            </p>
          )}

          {!responder.suspended_at && responder.verification === 'pending' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Tu registro está <strong>en revisión</strong>. Te avisaremos cuando
              un coordinador verifique tus credenciales. Mientras tanto puedes ver
              el mapa público.
            </p>
          )}

          {isActiveVerified(responder) && (
            <div className="space-y-3">
              <Link href="/voluntarios/cola" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <div className="font-medium">Cola de inspección →</div>
                <div className="text-sm text-zinc-500">Toma solicitudes, marca llegada y emite evaluaciones (verde/amarillo/rojo).</div>
              </Link>
              {responder.is_coordinator || responder.tier === 'senior' ? (
                <>
                  <Link href="/voluntarios/moderacion" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">Moderación de reportes →</div>
                    <div className="text-sm text-zinc-500">Aprueba o rechaza reportes de daño pendientes.</div>
                  </Link>
                  <Link href="/voluntarios/responders" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">Verificar responders →</div>
                    <div className="text-sm text-zinc-500">Revisa credenciales y aprueba nuevos responders.</div>
                  </Link>
                  <Link href="/voluntarios/centros" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">Aprobación de donaciones →</div>
                    <div className="text-sm text-zinc-500">Aprueba centros de acopio pendientes y organizaciones sugeridas.</div>
                  </Link>
                  <Link href="/voluntarios/intercambio" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">Mesa de habilidades →</div>
                    <div className="text-sm text-zinc-500">Verifica credenciales y conecta voluntarios con quienes los necesitan.</div>
                  </Link>
                </>
              ) : null}
            </div>
          )}

          <SignOutButton />
        </div>
      )}
    </div>
  );
}
