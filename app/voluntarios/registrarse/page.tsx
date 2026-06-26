'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { CREDENTIAL_TYPES, ESTADOS } from '@/lib/responder';
import { Disclaimer } from '@/components/Disclaimer';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export default function RegistrarsePage() {
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
        router.replace('/voluntarios/acceder');
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
      setErr('Sube una foto de tu credencial profesional.');
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb || !uid) {
      setErr('Sesión no válida. Vuelve a acceder.');
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
      setErr(e instanceof Error ? e.message : 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-zinc-500">Cargando…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Registro de responder</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tu cuenta queda <strong>en revisión</strong>. Un coordinador verifica tus
        credenciales (p. ej. número CIV) antes de darte acceso a ubicaciones
        precisas y a la cola de inspección.
      </p>
      <Disclaimer className="mt-3" />

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre completo</label>
            <input className={field} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cédula de identidad</label>
            <input className={field} value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="V-12345678" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de credencial</label>
            <select className={field} value={credentialType} onChange={(e) => setCredentialType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Número de credencial (CIV u otro)</label>
            <input className={field} value={credentialNumber} onChange={(e) => setCredentialNumber(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ente emisor</label>
            <input className={field} value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} placeholder="CIV, Bomberos, Protección Civil…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Organización</label>
            <input className={field} value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+58…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">WhatsApp</label>
            <input className={field} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+58…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Estado actual</label>
            <select className={field} value={currentEstado} onChange={(e) => setCurrentEstado(e.target.value)}>
              <option value="">Seleccionar…</option>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Especialidad (separar por comas)</label>
            <input className={field} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="estructural, geotécnico" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Estados donde puedes operar</label>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleOperating(s)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  operating.includes(s) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Credencial (foto) *</label>
            <input className={field} type="file" accept="image/*,application/pdf" onChange={(e) => setCredFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Selfie con la credencial</label>
            <input className={field} type="file" accept="image/*" onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-zinc-500">Rostro + credencial + fecha escrita a mano. Reduce suplantación.</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Código de activación (si tienes uno)</label>
          <input className={field} value={activationCode} onChange={(e) => setActivationCode(e.target.value)} placeholder="Emitido por coordinadores de brigada" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? 'Enviando…' : 'Enviar registro'}
        </button>
      </form>
    </div>
  );
}
