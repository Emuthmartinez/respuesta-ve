import Link from 'next/link';
import type { Metadata } from 'next';
import { t } from '@/lib/i18n';
import { getLocale, metaFor } from '@/lib/i18n-server';

export const generateMetadata = (): Promise<Metadata> => metaFor('primeros_auxilios');

const CARDS_ES: { t: string; steps: string[] }[] = [
  {
    t: '1 · Primero, tu seguridad',
    steps: [
      'No te conviertas en otra víctima: revisa que la zona sea segura (estructuras, cables, gas, fuego) antes de acercarte.',
      'Si hay olor a gas o riesgo de derrumbe, no entres. Espera a los equipos de rescate.',
      'Llama al 171 (o 911 / 112 / *1) y da ubicación, número de personas y tipo de emergencia.',
    ],
  },
  {
    t: '2 · Hemorragia grave',
    steps: [
      'Aplica presión firme y directa sobre la herida con un paño limpio o tela.',
      'No retires el paño si se empapa: coloca otro encima y sigue presionando.',
      'Si es un brazo o pierna, elévalo por encima del corazón si no hay fractura.',
      'Un torniquete solo como último recurso ante una hemorragia que no se detiene y pone en riesgo la vida; anota la hora.',
    ],
  },
  {
    t: '3 · No respira — RCP',
    steps: [
      'Comprueba respuesta y respiración. Si no respira con normalidad, inicia compresiones.',
      'Centro del pecho, manos entrelazadas, brazos rectos. Comprime fuerte y rápido: 100–120 por minuto, ~5–6 cm de profundidad.',
      'Deja que el pecho se reexpanda entre compresiones. No te detengas hasta que llegue ayuda.',
      'Si no tienes entrenamiento, haz solo compresiones (RCP con las manos).',
    ],
  },
  {
    t: '4 · Persona atrapada o aplastada',
    steps: [
      'NO la muevas si sospechas lesión de cuello o columna, salvo peligro inmediato (fuego, derrumbe).',
      'Háblale, mantén la calma y mantenla abrigada para evitar hipotermia.',
      'Si lleva mucho tiempo aplastada, liberar el peso puede ser peligroso (síndrome de aplastamiento): pide ayuda profesional antes de moverla si es posible.',
      'Marca la ubicación y avisa a rescate (puedes usar el mapa de esta plataforma).',
    ],
  },
  {
    t: '5 · Inconsciente pero respira',
    steps: [
      'Colócala de lado en posición de recuperación para mantener la vía aérea abierta.',
      'Vigila la respiración de forma constante.',
      'No le des comida ni bebida.',
    ],
  },
  {
    t: '6 · Fracturas y golpes',
    steps: [
      'Inmoviliza la zona; no intentes recolocar el hueso.',
      'Aplica frío envuelto en tela para reducir la inflamación (no hielo directo).',
      'No muevas a la persona más de lo necesario.',
    ],
  },
  {
    t: '7 · Estado de shock',
    steps: [
      'Señales: piel pálida y fría, sudor, pulso rápido, confusión.',
      'Acuesta a la persona y eleva las piernas (si no hay fractura ni lesión que lo impida).',
      'Abrígala y tranquilízala. Busca atención médica.',
    ],
  },
  {
    t: '8 · Quemaduras',
    steps: [
      'Enfría con agua corriente limpia durante unos 20 minutos.',
      'No apliques hielo, cremas, pasta de dientes ni remedios caseros.',
      'Cubre con un paño limpio y no revientes ampollas.',
    ],
  },
  {
    t: '9 · Apoyo psicológico (PAP)',
    steps: [
      'Observa, escucha y conecta: acompaña sin presionar a hablar.',
      'Cubre necesidades básicas (seguridad, agua, contacto con familiares).',
      'Validar el miedo es normal. Si hay crisis persistente, busca apoyo en salud mental (ver Recursos).',
    ],
  },
];

const CARDS_EN: { t: string; steps: string[] }[] = [
  {
    t: '1 · Your safety first',
    steps: [
      "Don't become another victim: check that the area is safe (structures, cables, gas, fire) before approaching.",
      'If you smell gas or there is a collapse risk, do not enter. Wait for rescue teams.',
      'Call 171 (or 911 / 112 / *1) and give your location, number of people, and type of emergency.',
    ],
  },
  {
    t: '2 · Severe bleeding',
    steps: [
      'Apply firm, direct pressure to the wound with a clean cloth or fabric.',
      'Do not remove the cloth if it soaks through — place another on top and keep pressing.',
      'If the injury is on an arm or leg, elevate it above heart level if no fracture is present.',
      'Use a tourniquet only as a last resort when life-threatening bleeding cannot be stopped; note the time applied.',
    ],
  },
  {
    t: '3 · Not breathing — CPR',
    steps: [
      'Check for responsiveness and breathing. If not breathing normally, start compressions.',
      'Center of the chest, interlocked hands, straight arms. Push hard and fast: 100–120 per minute, ~5–6 cm deep.',
      'Let the chest fully recoil between compressions. Do not stop until help arrives.',
      'If untrained, perform hands-only CPR (compressions only).',
    ],
  },
  {
    t: '4 · Trapped or crushed person',
    steps: [
      'Do NOT move them if you suspect a neck or spine injury, unless in immediate danger (fire, collapse).',
      'Talk to them, keep calm, and keep them warm to prevent hypothermia.',
      'If they have been crushed for a long time, releasing the weight can be dangerous (crush syndrome): seek professional help before moving them if possible.',
      'Mark the location and alert rescue teams (you can use this platform\'s map).',
    ],
  },
  {
    t: '5 · Unconscious but breathing',
    steps: [
      'Place them on their side in the recovery position to keep the airway open.',
      'Monitor breathing continuously.',
      'Do not give food or drink.',
    ],
  },
  {
    t: '6 · Fractures and impacts',
    steps: [
      'Immobilize the area; do not attempt to reset the bone.',
      'Apply cold wrapped in cloth to reduce swelling (no direct ice).',
      'Move the person as little as possible.',
    ],
  },
  {
    t: '7 · Shock',
    steps: [
      'Signs: pale and cold skin, sweating, rapid pulse, confusion.',
      'Lay the person down and elevate their legs (unless a fracture or injury prevents it).',
      'Keep them warm and calm. Seek medical attention.',
    ],
  },
  {
    t: '8 · Burns',
    steps: [
      'Cool with clean running water for about 20 minutes.',
      'Do not apply ice, creams, toothpaste, or home remedies.',
      'Cover with a clean cloth and do not burst blisters.',
    ],
  },
  {
    t: '9 · Psychological first aid (PFA)',
    steps: [
      'Observe, listen, and connect: be present without pressuring them to talk.',
      'Meet basic needs (safety, water, contact with family).',
      "Acknowledging fear is normal. If there is a persistent crisis, seek mental health support (see Resources).",
    ],
  },
];

export default async function PrimerosAuxiliosPage() {
  const locale = await getLocale();
  const d = t(locale).primeros_auxilios;
  const CARDS = locale === 'en' ? CARDS_EN : CARDS_ES;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {d.subtext}
      </p>

      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>{d.warning_label}</strong> {d.warning}{' '}
        <strong>171</strong> {d.warning_suffix}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <div key={c.t} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="font-semibold">{c.t}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {c.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <section className="mt-8 text-xs text-zinc-500">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{d.sources_heading}</h2>
        <ul className="mt-2 space-y-1">
          <li>
            <a className="underline" href="https://www.ifrc.org/our-work/health-and-care/first-aid" target="_blank" rel="noreferrer">
              {locale === 'en' ? 'Red Cross / IFRC — First Aid' : 'Cruz Roja / IFRC — Primeros auxilios'}
            </a>
          </li>
          <li>
            <a className="underline" href="https://www.who.int/health-topics/emergency-care" target="_blank" rel="noreferrer">
              {locale === 'en' ? 'World Health Organization (WHO) — Emergency care' : 'Organización Mundial de la Salud (OMS) — Atención de emergencia'}
            </a>
          </li>
          <li>
            <a className="underline" href="https://www.ready.gov/earthquakes" target="_blank" rel="noreferrer">
              {locale === 'en' ? 'FEMA / Ready.gov — Earthquakes' : 'FEMA / Ready.gov — Terremotos'}
            </a>
          </li>
        </ul>
        <p className="mt-4">
          <Link href="/recursos" className="text-red-600 underline">{d.more_resources}</Link>
        </p>
      </section>
    </div>
  );
}
