import Link from 'next/link';
import type { Metadata } from 'next';
import { getResponderProfile, isActiveVerified } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { credentialLabel, verificationLabel, tierLabel } from '@/lib/responder';
import { SignOutButton } from '@/components/voluntarios/SignOutButton';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('voluntarios');

const STR = {
  es: {
    heading: 'Voluntarios y responders',
    dbNotConnected: 'La base de datos aún no está conectada en este entorno.',
    notSignedInDesc: '¿Cómo quieres ayudar? Elige tu camino: hay un lugar para profesionales con credenciales y otro para cualquier persona dispuesta.',
    signInBtn: 'Acceder / Registrarme',
    pathCredHeading: 'Tengo credenciales profesionales →',
    pathCredDesc: 'Ingeniero, médico, enfermero, rescatista, bombero, Protección Civil. Verifica tus credenciales para atender inspecciones y ver ubicaciones precisas.',
    pathGeneralHeading: 'Quiero ayudar de otra forma →',
    pathGeneralDesc: 'Transporte, traducción, refugio, electricidad, plomería, voluntariado general. No requiere credenciales.',
    externalHeading: 'Otros registros de voluntarios →',
    externalDesc: 'Voluntarios Profesionales — red de profesionales y voluntarios para ONGs verificadas.',
    noProfileDesc: 'Tu sesión está activa. Elige cómo quieres ayudar.',
    completeRegistration: 'Soy responder con credenciales →',
    completeRegistrationDesc: 'Completa tu perfil y solicita verificación de credenciales.',
    offerHelpHeading: 'Ofrezco otra ayuda →',
    offerHelpDesc: 'Registra una habilidad (transporte, traducción, refugio…) sin credenciales.',
    suspended: 'Suspendido',
    suspendedMsg: 'Tu cuenta está suspendida. Contacta a un coordinador.',
    pendingMsg: 'Tu registro está en revisión. Te avisaremos cuando un coordinador verifique tus credenciales. Mientras tanto puedes ver el mapa público.',
    pendingStrong: 'en revisión',
    queueLink: 'Cola de inspección →',
    queueDesc: 'Toma solicitudes, marca llegada y emite evaluaciones (verde/amarillo/rojo).',
    moderationLink: 'Moderación de reportes →',
    moderationDesc: 'Aprueba o rechaza reportes de daño pendientes.',
    respondersLink: 'Verificar responders →',
    respondersDesc: 'Revisa credenciales y aprueba nuevos responders.',
    centrosLink: 'Aprobación de donaciones →',
    centrosDesc: 'Aprueba centros de acopio pendientes y organizaciones sugeridas.',
    intercambioLink: 'Mesa de habilidades →',
    intercambioDesc: 'Verifica credenciales y conecta voluntarios con quienes los necesitan.',
    personasLink: 'Deduplicación de personas →',
    personasDesc: 'Fusiona o separa registros de “posible misma persona”; revisa conflictos.',
    apiKeysLink: 'Claves de API →',
    apiKeysDesc: 'Emite y revoca claves para socios y agentes que usan la API de deduplicación.',
  },
  en: {
    heading: 'Volunteers & responders',
    dbNotConnected: 'The database is not yet connected in this environment.',
    notSignedInDesc: 'How do you want to help? Choose your path: there is a place for credentialed professionals and one for anyone willing to pitch in.',
    signInBtn: 'Sign in / Register',
    pathCredHeading: 'I have professional credentials →',
    pathCredDesc: 'Engineer, doctor, nurse, rescuer, firefighter, Civil Protection. Verify your credentials to handle inspections and see precise locations.',
    pathGeneralHeading: 'I want to help another way →',
    pathGeneralDesc: 'Transport, translation, shelter, electrical, plumbing, general volunteering. No credentials required.',
    externalHeading: 'Other volunteer registries →',
    externalDesc: 'Voluntarios Profesionales — network of professionals and volunteers for verified NGOs.',
    noProfileDesc: 'Your session is active. Choose how you want to help.',
    completeRegistration: "I'm a credentialed responder →",
    completeRegistrationDesc: 'Complete your profile and request credential verification.',
    offerHelpHeading: 'I offer other help →',
    offerHelpDesc: 'Register a skill (transport, translation, shelter…) without credentials.',
    suspended: 'Suspended',
    suspendedMsg: 'Your account is suspended. Contact a coordinator.',
    pendingMsg: 'Your registration is under review. We\'ll notify you when a coordinator verifies your credentials. In the meantime you can browse the public map.',
    pendingStrong: 'under review',
    queueLink: 'Inspection queue →',
    queueDesc: 'Claim requests, mark arrival, and submit assessments (green/yellow/red).',
    moderationLink: 'Report moderation →',
    moderationDesc: 'Approve or reject pending damage reports.',
    respondersLink: 'Verify responders →',
    respondersDesc: 'Review credentials and approve new responders.',
    centrosLink: 'Donation approval →',
    centrosDesc: 'Approve pending collection centers and suggested organizations.',
    intercambioLink: 'Skills desk →',
    intercambioDesc: 'Verify credentials and connect volunteers with those who need them.',
    personasLink: 'People deduplication →',
    personasDesc: 'Merge or split “possibly the same person” records; review conflicts.',
    apiKeysLink: 'API keys →',
    apiKeysDesc: 'Issue and revoke keys for partners and agents using the dedup API.',
  },
} as const;

export default async function VoluntariosPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { user, responder } = await getResponderProfile();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>

      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {s.dbNotConnected}
        </p>
      )}

      {/* Not signed in — route by how the person can help */}
      {!user && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {s.notSignedInDesc}
          </p>
          <div className="space-y-3">
            <Link href="/voluntarios/acceder" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="font-medium">{s.pathCredHeading}</div>
              <div className="text-sm text-zinc-500">{s.pathCredDesc}</div>
            </Link>
            <Link href="/intercambio/ofrecer" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="font-medium">{s.pathGeneralHeading}</div>
              <div className="text-sm text-zinc-500">{s.pathGeneralDesc}</div>
            </Link>
          </div>
          <a
            href="https://voluntariosprofesionales.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-dashed border-black/15 p-4 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            <div className="font-medium">{s.externalHeading}</div>
            <div className="text-zinc-500">{s.externalDesc}</div>
          </a>
        </div>
      )}

      {/* Signed in, no responder profile yet — offer both doors */}
      {user && !responder && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {s.noProfileDesc}
          </p>
          <div className="space-y-3">
            <Link href="/voluntarios/registrarse" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="font-medium">{s.completeRegistration}</div>
              <div className="text-sm text-zinc-500">{s.completeRegistrationDesc}</div>
            </Link>
            <Link href="/intercambio/ofrecer" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              <div className="font-medium">{s.offerHelpHeading}</div>
              <div className="text-sm text-zinc-500">{s.offerHelpDesc}</div>
            </Link>
          </div>
          <SignOutButton />
        </div>
      )}

      {/* Signed in with a profile */}
      {user && responder && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{responder.full_name}</div>
                <div className="text-sm text-zinc-500">{credentialLabel(responder.credential_type, locale)}</div>
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
                {responder.suspended_at ? s.suspended : verificationLabel(responder.verification, locale)}
                {' · '}
                {tierLabel(responder.tier, locale)}
              </span>
            </div>
          </div>

          {responder.suspended_at && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {s.suspendedMsg}
            </p>
          )}

          {!responder.suspended_at && responder.verification === 'pending' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {locale === 'es' ? (
                <>Tu registro está <strong>en revisión</strong>. Te avisaremos cuando un coordinador verifique tus credenciales. Mientras tanto puedes ver el mapa público.</>
              ) : (
                <>Your registration is <strong>under review</strong>. We&apos;ll notify you when a coordinator verifies your credentials. In the meantime you can browse the public map.</>
              )}
            </p>
          )}

          {isActiveVerified(responder) && (
            <div className="space-y-3">
              <Link href="/voluntarios/cola" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <div className="font-medium">{s.queueLink}</div>
                <div className="text-sm text-zinc-500">{s.queueDesc}</div>
              </Link>
              {responder.is_coordinator || responder.tier === 'senior' ? (
                <>
                  <Link href="/voluntarios/moderacion" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.moderationLink}</div>
                    <div className="text-sm text-zinc-500">{s.moderationDesc}</div>
                  </Link>
                  <Link href="/voluntarios/responders" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.respondersLink}</div>
                    <div className="text-sm text-zinc-500">{s.respondersDesc}</div>
                  </Link>
                  <Link href="/voluntarios/centros" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.centrosLink}</div>
                    <div className="text-sm text-zinc-500">{s.centrosDesc}</div>
                  </Link>
                  <Link href="/voluntarios/intercambio" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.intercambioLink}</div>
                    <div className="text-sm text-zinc-500">{s.intercambioDesc}</div>
                  </Link>
                  <Link href="/voluntarios/personas" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.personasLink}</div>
                    <div className="text-sm text-zinc-500">{s.personasDesc}</div>
                  </Link>
                  <Link href="/voluntarios/api-keys" className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                    <div className="font-medium">{s.apiKeysLink}</div>
                    <div className="text-sm text-zinc-500">{s.apiKeysDesc}</div>
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
