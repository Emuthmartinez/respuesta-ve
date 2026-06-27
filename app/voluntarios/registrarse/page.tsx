'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { CREDENTIAL_TYPES, ESTADOS } from '@/lib/responder';
import { Disclaimer } from '@/components/Disclaimer';
import { useLocale } from '@/lib/locale-context';
import { tr } from '@/lib/i18n';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const STR = {
  es: {
    loading: 'Cargando…',
    heading: 'Registro de responder',
    desc: 'Tu cuenta queda en revisión. Un coordinador verifica tus credenciales (p. ej. número CIV) antes de darte acceso a ubicaciones precisas y a la cola de inspección.',
    descStrong: 'en revisión',
    fullName: 'Nombre completo',
    nationalId: 'Cédula de identidad',
    nationalIdPlaceholder: 'V-12345678',
    credentialType: 'Tipo de credencial',
    credentialNumber: 'Número de credencial (CIV u otro)',
    issuingBody: 'Ente emisor',
    issuingBodyPlaceholder: 'CIV, Bomberos, Protección Civil…',
    organization: 'Organización',
    phone: 'Teléfono',
    phonePlaceholder: '+58…',
    whatsapp: 'WhatsApp',
    currentEstado: 'Estado actual',
    selectEstado: 'Seleccionar…',
    specialty: 'Especialidad (separar por comas)',
    specialtyPlaceholder: 'estructural, geotécnico',
    operatingEstados: 'Estados donde puedes operar',
    credentialPhoto: 'Credencial (foto) *',
    selfie: 'Selfie con la credencial',
    selfieHint: 'Rostro + credencial + fecha escrita a mano. Reduce suplantación.',
    activationCode: 'Código de activación (si tienes uno)',
    activationCodePlaceholder: 'Emitido por coordinadores de brigada',
    missingCredential: 'Sube una foto de tu credencial profesional.',
    invalidSession: 'Sesión no válida. Vuelve a acceder.',
    saveFailed: 'No se pudo guardar el registro.',
    sending: 'Enviando…',
    submit: 'Enviar registro',
    noCredentialPre: '¿No tienes credenciales profesionales? ',
    noCredentialLink: 'Ofrece otra ayuda sin credenciales →',
  },
  en: {
    loading: 'Loading…',
    heading: 'Responder registration',
    desc: 'Your account will be under review. A coordinator verifies your credentials (e.g. CIV number) before granting access to precise locations and the inspection queue.',
    descStrong: 'under review',
    fullName: 'Full name',
    nationalId: 'National ID',
    nationalIdPlaceholder: 'V-12345678',
    credentialType: 'Credential type',
    credentialNumber: 'License/CIV no.',
    issuingBody: 'Issuing body',
    issuingBodyPlaceholder: 'CIV, Fire Dept, Civil Protection…',
    organization: 'Organization',
    phone: 'Phone',
    phonePlaceholder: '+58…',
    whatsapp: 'WhatsApp',
    currentEstado: 'Current state',
    selectEstado: 'Select…',
    specialty: 'Specialty (comma-separated)',
    specialtyPlaceholder: 'structural, geotechnical',
    operatingEstados: 'States where you can operate',
    credentialPhoto: 'Credential photo *',
    selfie: 'Selfie with credential',
    selfieHint: 'Face + credential + handwritten date. Reduces impersonation.',
    activationCode: 'Activation code (if you have one)',
    activationCodePlaceholder: 'Issued by brigade coordinators',
    missingCredential: 'Please upload a photo of your professional credential.',
    invalidSession: 'Invalid session. Please sign in again.',
    saveFailed: 'Could not save the registration.',
    sending: 'Submitting…',
    submit: 'Submit registration',
    noCredentialPre: "Don't have professional credentials? ",
    noCredentialLink: 'Offer other help without credentials →',
  },
} as const;

export default function RegistrarsePage() {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [fullName, setFullName] = useState('');
  const [cedula, setCedula] = useState('');
  const [credentialType, setCredentialType] = useState('structural_engineer');
  const [credentialNumber, setCredentialNumber] = useState('');
  const [issuingBody, setIssuingBody] = useState('CIV');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [currentEstado, setCurrentEstado] = useState('');
  const [operating, setOperating] = useState<string[]>([]);
  const [specialty, setSpecialty] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [credFile, setCredFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setChecking(false);
      return;
    }
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/voluntarios/acceder?next=' + encodeURIComponent('/voluntarios/registrarse'));
        return;
      }
      setUid(data.user.id);
      setChecking(false);
    });
  }, [router]);

  function toggleOperating(e: string) {
    setOperating((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function uploadDoc(sb: NonNullable<ReturnType<typeof getSupabaseBrowser>>, file: File, kind: string) {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${uid}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('responder-docs').upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (!credFile) {
      setErr(s.missingCredential);
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb || !uid) {
      setErr(s.invalidSession);
      return;
    }
    setSaving(true);
    try {
      const credPath = await uploadDoc(sb, credFile, 'credential');
      const selfiePath = selfieFile ? await uploadDoc(sb, selfieFile, 'selfie') : null;

      const { error } = await sb.from('responders').insert({
        id: uid,
        full_name: fullName,
        credential_type: credentialType,
        credential_number: credentialNumber || null,
        credential_issuing_body: issuingBody || null,
        organization: organization || null,
        phone: phone || null,
        whatsapp_number: whatsapp || null,
        cedula_identidad: cedula || null,
        current_estado: currentEstado || null,
        operating_estado: operating.length ? operating : null,
        specialty: specialty ? specialty.split(',').map((s) => s.trim()).filter(Boolean) : null,
        activation_code: activationCode || null,
        credential_doc_path: credPath,
        selfie_with_doc_path: selfiePath,
      });
      if (error) throw new Error(error.message);
      router.push('/voluntarios');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-zinc-500">{s.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {locale === 'es' ? (
          <>Tu cuenta queda <strong>en revisión</strong>. Un coordinador verifica tus credenciales (p. ej. número CIV) antes de darte acceso a ubicaciones precisas y a la cola de inspección.</>
        ) : (
          <>Your account will be <strong>under review</strong>. A coordinator verifies your credentials (e.g. CIV number) before granting access to precise locations and the inspection queue.</>
        )}
      </p>
      <Disclaimer className="mt-3" />

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {s.noCredentialPre}
        <Link href="/intercambio/ofrecer" className="font-medium text-red-600 hover:underline">
          {s.noCredentialLink}
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.fullName}</label>
            <input className={field} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.nationalId}</label>
            <input className={field} value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder={s.nationalIdPlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.credentialType}</label>
            <select className={field} value={credentialType} onChange={(e) => setCredentialType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => <option key={c.value} value={c.value}>{tr(c.label, locale)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.credentialNumber}</label>
            <input className={field} value={credentialNumber} onChange={(e) => setCredentialNumber(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.issuingBody}</label>
            <input className={field} value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} placeholder={s.issuingBodyPlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.organization}</label>
            <input className={field} value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.phone}</label>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={s.phonePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.whatsapp}</label>
            <input className={field} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder={s.phonePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.currentEstado}</label>
            <select className={field} value={currentEstado} onChange={(e) => setCurrentEstado(e.target.value)}>
              <option value="">{s.selectEstado}</option>
              {ESTADOS.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.specialty}</label>
            <input className={field} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={s.specialtyPlaceholder} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.operatingEstados}</label>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => toggleOperating(st)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  operating.includes(st) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.credentialPhoto}</label>
            <input className={field} type="file" accept="image/*,application/pdf" onChange={(e) => setCredFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.selfie}</label>
            <input className={field} type="file" accept="image/*" onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-zinc-500">{s.selfieHint}</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.activationCode}</label>
          <input className={field} value={activationCode} onChange={(e) => setActivationCode(e.target.value)} placeholder={s.activationCodePlaceholder} />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? s.sending : s.submit}
        </button>
      </form>
    </div>
  );
}
