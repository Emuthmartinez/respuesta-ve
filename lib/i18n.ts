// lib/i18n.ts — Minimal SSR-safe bilingual dictionary (ES / EN).
// Works on Cloudflare Workers / OpenNext (no middleware required).
// Server components: await getLocale() then t(locale).key
// Client components: receive locale as prop from server parent.

// NOTE: this module is client-safe (no next/headers). The server-only
// getLocale() lives in lib/i18n-server.ts so client components can import the
// dictionary without pulling server APIs into the client bundle.

export type Locale = 'es' | 'en';
export const DEFAULT_LOCALE: Locale = 'es';

/** A string that exists in both locales. Used by lib/*.ts label dictionaries. */
export type Bilingual = { es: string; en: string };

/** Pick the active-locale variant from a bilingual {es,en} pair. */
export function tr(b: Bilingual, locale: Locale): string {
  return b[locale];
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

const dict = {
  es: {
    nav: {
      brand: 'Respuesta VE',
      tagline: 'Terremoto 2026',
      map: 'Mapa',
      report: 'Reportar',
      donate: 'Donar',
      exchange: 'Intercambio',
      resources: 'Recursos',
      people: 'Personas',
      debunks: 'Desmentidos',
      volunteers: 'Voluntarios',
    },
    meta: {
      default: {
        title: 'Respuesta VE — Mapa de daños · Terremoto Venezuela 2026',
        description:
          'Plataforma comunitaria de coordinación tras el terremoto en Venezuela: mapa de edificios dañados, inspección estructural, donaciones verificadas, ayuda mutua y búsqueda de personas.',
      },
      afuera: {
        title: 'Ayuda desde el exterior — Respuesta VE',
        description: 'Organizaciones verificadas, centros de acopio y plataformas para buscar personas tras el terremoto en Venezuela.',
      },
      recursos: { title: 'Recursos — Respuesta VE' },
      intercambio: { title: 'Intercambio de ayuda — Respuesta VE' },
      personas: { title: 'Personas — Respuesta VE' },
      desmentidos: {
        title: 'Información Falsa — Respuesta VE',
        description: 'Listado de noticias, videos e imágenes relacionados con el terremoto en Venezuela que han sido verificados como falsos o engañosos.',
      },
      primeros_auxilios: {
        title: 'Primeros auxilios — Respuesta VE',
        description: 'Guía básica de primeros auxilios tras un terremoto, basada en la Cruz Roja, la OMS y FEMA. Información educativa; ante una emergencia llama al 171.',
      },
      voluntarios: { title: 'Voluntarios — Respuesta VE' },
      voluntarios_cola: { title: 'Cola de inspección — Respuesta VE' },
      voluntarios_centros: { title: 'Aprobación de donaciones — Respuesta VE' },
      voluntarios_evaluar: { title: 'Evaluación ATC-20 — Respuesta VE' },
      voluntarios_intercambio: { title: 'Mesa de habilidades — Respuesta VE' },
      voluntarios_moderacion: { title: 'Moderación — Respuesta VE' },
      voluntarios_responders: { title: 'Verificación de responders — Respuesta VE' },
    },
    gate: {
      brand_label: 'Respuesta VE · Terremoto 2026',
      heading: '¿Dónde estás?',
      subtext:
        'Esto adapta la plataforma a cómo puedes ayudar o recibir ayuda.',
      inside_btn: 'Estoy en Venezuela',
      inside_sub: 'Mapa de daños, recursos, pedir/ofrecer ayuda',
      outside_btn: 'Estoy fuera de Venezuela',
      outside_sub: 'Dónde donar y cómo ayudar desde el exterior',
    },
    home: {
      heading: 'Mapa de daños y respuesta',
      subtext:
        'Reporta edificios dañados, solicita inspección de estructuras y ayuda a ubicar las zonas más afectadas por el terremoto.',
      cta_report: 'Reportar daño',
      cta_volunteer: 'Soy voluntario',
    },
    afuera: {
      heading: 'Ayuda desde donde estás',
      subtext:
        'Tres formas de ayudar: donar dinero, llevar bienes a un centro de acopio, o colaborar en la búsqueda de personas.',
      link_inside: 'Estoy en Venezuela →',
      scam_heading: 'Cuidado con las estafas.',
      scam_verify_prefix: 'Verifica organizaciones en',
      scam_verify_and: 'y',
      section1_title: '1 · Donar dinero',
      section1_count: (n: number) => `${n} organizacion${n !== 1 ? 'es' : ''}`,
      section1_desc:
        'Organizaciones verificadas que aceptan donaciones monetarias en línea.',
      section1_empty: 'No hay organizaciones para mostrar todavía.',
      org_verified: '✓ verificada',
      section2_title: '2 · Donar en persona',
      section2_count: (n: number) => `${n} centro${n !== 1 ? 's' : ''} de acopio`,
      section2_desc:
        'Centros físicos que reciben bienes y suministros. Si permites el acceso a tu ubicación los ordenamos del más cercano al más lejano.',
      section2_add: '+ Agregar un centro',
      section3_title: '3 · Buscar o reportar personas',
      section3_count: (n: number) => `${n} plataforma${n !== 1 ? 's' : ''}`,
      section3_desc:
        'Plataformas para localizar personas desaparecidas o reportar información. Estas organizaciones no reciben donaciones monetarias a través de este listado.',
      section3_empty: 'No hay plataformas listadas todavía.',
      other_heading: 'Otras formas de ayudar',
      other: [
        ['Amplifica', 'Comparte información verificada en tus redes.'],
        ['Traduce', 'Ayuda a traducir testimonios para medios internacionales.'],
        ['Contacta autoridades', 'Pide a tus representantes que apoyen la ayuda humanitaria.'],
        ['Coordina', 'Conecta familiares en el exterior con recursos dentro del país.'],
      ] as [string, string][],
      org_cta_read: 'Leer →',
      org_cta_find: 'Buscar / reportar →',
      org_cta_donate: 'Donar →',
      org_cta_campaign: 'Ver campaña →',
    },
    recursos: {
      heading: 'Ayuda en Venezuela',
      subtext: 'Líneas de emergencia, centros de ayuda y recursos de confianza cerca de ti.',
      emergency_heading: 'Emergencias',
      family_heading: 'Buscar a tu familia',
      family_link: 'Buscar personas desaparecidas →',
      family_sub: 'Busca en los registros reunidos de personas desaparecidas tras el terremoto.',
      centers_heading: 'Centros de acopio y ayuda en Venezuela',
      centers_note:
        'Puntos verificados que reciben y distribuyen suministros. Las ubicaciones se muestran de forma aproximada.',
      first_aid_heading: 'Primeros auxilios',
      first_aid_link: 'Guía de primeros auxilios →',
      first_aid_sub: 'Pasos básicos basados en Cruz Roja, OMS y FEMA.',
      mental_health: 'Salud mental',
      mental_health_note:
        'Estas son líneas de apoyo comunitario; no reemplazan la atención clínica de emergencia.',
      structural: 'Inspección de estructuras',
      structural_link: 'Solicitar inspección de un edificio →',
      structural_sub: 'Un responder con credenciales evalúa si es seguro.',
      medical_rescue: 'Médico y rescate',
      news: 'Noticias e información',
      footer_missing: '¿Conoces un recurso que falta?',
      footer_soon: 'Pronto podrás sugerirlo aquí.',
      footer_verified:
        'Mientras tanto, las organizaciones se muestran tras ser verificadas por un coordinador.',
    },
    primeros_auxilios: {
      heading: 'Primeros auxilios',
      subtext:
        'Guía básica para los primeros minutos tras un sismo. Basada en lineamientos de la Cruz Roja, la Organización Mundial de la Salud (OMS) y FEMA.',
      warning_label: 'Importante:',
      warning:
        'esta información es educativa y no reemplaza la atención de un profesional ni un curso certificado. Ante una emergencia llama al',
      warning_suffix: 'y sigue las instrucciones de Protección Civil y Bomberos.',
      sources_heading: 'Fuentes',
      more_resources: 'Ver más recursos de emergencia',
    },
    disclaimer: {
      label: 'Aviso:',
      text: 'Esta es una herramienta de coordinación comunitaria, no una certificación oficial. Ante una emergencia llame al',
      number: '171',
      suffix: 'y siga las instrucciones de Protección Civil y Bomberos.',
    },
    footer: {
      text: 'Herramienta comunitaria para la respuesta al terremoto · Las ubicaciones se muestran de forma aproximada para proteger a las personas.',
    },
    principles: {
      heading: 'Cómo trabajamos',
      items: [
        {
          icon: '🛡️',
          title: 'Ubicaciones protegidas',
          text: 'El mapa abierto solo muestra zonas aproximadas. Las direcciones exactas no se exponen, para que ningún reporte se use en contra de las víctimas.',
        },
        {
          icon: '🔒',
          title: 'Tu privacidad primero',
          text: 'Nada de rastreadores, publicidad ni venta de datos. Lo que compartes sirve únicamente para coordinar la ayuda.',
        },
        {
          icon: '🌐',
          title: 'Liviana de verdad',
          text: 'Pensada para abrir rápido aunque tengas poca señal o pocos datos.',
        },
        {
          icon: '🤝',
          title: 'Ayuda sin condiciones',
          text: 'Conectar con ayuda siempre es gratis. Nadie debería pagar por ser asistido.',
        },
        {
          icon: '📖',
          title: 'Primeros auxilios',
          text: 'Pasos esenciales con referencias de la Cruz Roja, la OMS y FEMA.',
          href: '/primeros-auxilios',
          cta: 'Abrir guía →',
        },
      ],
    },
    toggle: { to_en: 'EN', to_es: 'ES' },
    safety: {
      donation:
        'Nunca dones por transferencia a cuentas personales, tarjetas de regalo ni criptomonedas. Las organizaciones legítimas usan plataformas de donación establecidas.',
      scamWarning:
        'Los estafadores crean cuentas nuevas con nombres casi idénticos a organizaciones reales. Verifica que la organización aparezca en esta lista antes de donar.',
      skills:
        'El contacto es anónimo y mediado. Nunca compartas tu número de teléfono, cédula ni dirección exacta en los mensajes.',
    },
  },

  en: {
    nav: {
      brand: 'Respuesta VE',
      tagline: 'Earthquake 2026',
      map: 'Map',
      report: 'Report',
      donate: 'Donate',
      exchange: 'Exchange',
      resources: 'Resources',
      people: 'People',
      debunks: 'Debunks',
      volunteers: 'Volunteers',
    },
    meta: {
      default: {
        title: 'Respuesta VE — Damage map · Venezuela Earthquake 2026',
        description:
          'Community coordination platform after the earthquake in Venezuela: damaged-building map, structural inspection, verified donations, mutual aid, and finding missing people.',
      },
      afuera: {
        title: 'Help from abroad — Respuesta VE',
        description: 'Verified organizations, collection centers, and platforms to find missing people after the earthquake in Venezuela.',
      },
      recursos: { title: 'Resources — Respuesta VE' },
      intercambio: { title: 'Help exchange — Respuesta VE' },
      personas: { title: 'Missing people — Respuesta VE' },
      desmentidos: {
        title: 'Misinformation — Respuesta VE',
        description: 'A list of news, videos, and images related to the earthquake in Venezuela that have been verified as false or misleading.',
      },
      primeros_auxilios: {
        title: 'First aid — Respuesta VE',
        description: 'Basic first-aid guide after an earthquake, based on the Red Cross, WHO, and FEMA. Educational information; in an emergency call 171.',
      },
      voluntarios: { title: 'Volunteers — Respuesta VE' },
      voluntarios_cola: { title: 'Inspection queue — Respuesta VE' },
      voluntarios_centros: { title: 'Donation approvals — Respuesta VE' },
      voluntarios_evaluar: { title: 'ATC-20 assessment — Respuesta VE' },
      voluntarios_intercambio: { title: 'Skills desk — Respuesta VE' },
      voluntarios_moderacion: { title: 'Moderation — Respuesta VE' },
      voluntarios_responders: { title: 'Responder verification — Respuesta VE' },
    },
    gate: {
      brand_label: 'Respuesta VE · Earthquake 2026',
      heading: 'Where are you?',
      subtext:
        'This tailors the platform to how you can help or receive help.',
      inside_btn: "I'm in Venezuela",
      inside_sub: 'Damage map, resources, request/offer help',
      outside_btn: "I'm outside Venezuela",
      outside_sub: 'Where to donate and how to help from abroad',
    },
    home: {
      heading: 'Damage map & response',
      subtext:
        'Report damaged buildings, request structural inspections, and help locate the most affected areas.',
      cta_report: 'Report damage',
      cta_volunteer: "I'm a volunteer",
    },
    afuera: {
      heading: 'Help from where you are',
      subtext:
        'Three ways to help: donate money, drop off supplies at a collection center, or help find missing people.',
      link_inside: "I'm in Venezuela →",
      scam_heading: 'Watch out for scams.',
      scam_verify_prefix: 'Verify organizations at',
      scam_verify_and: 'and',
      section1_title: '1 · Donate money',
      section1_count: (n: number) => `${n} organization${n !== 1 ? 's' : ''}`,
      section1_desc: 'Verified organizations that accept online monetary donations.',
      section1_empty: 'No organizations to show yet.',
      org_verified: '✓ verified',
      section2_title: '2 · Donate in person',
      section2_count: (n: number) => `${n} collection center${n !== 1 ? 's' : ''}`,
      section2_desc:
        'Physical centers accepting goods and supplies. Allow location access to sort by proximity.',
      section2_add: '+ Add a center',
      section3_title: '3 · Find or report missing people',
      section3_count: (n: number) => `${n} platform${n !== 1 ? 's' : ''}`,
      section3_desc:
        'Platforms to locate missing persons or report information. These organizations do not accept monetary donations through this listing.',
      section3_empty: 'No platforms listed yet.',
      other_heading: 'Other ways to help',
      other: [
        ['Amplify', 'Share verified information and campaigns from real organizations on your networks.'],
        ['Translate', 'Help translate testimonies and needs for international media and donors.'],
        ['Contact officials', 'Ask your representatives to support humanitarian aid.'],
        ['Coordinate', 'Connect family members abroad with resources inside the country.'],
      ] as [string, string][],
      org_cta_read: 'Read →',
      org_cta_find: 'Find / report →',
      org_cta_donate: 'Donate →',
      org_cta_campaign: 'View campaign →',
    },
    recursos: {
      heading: 'Help in Venezuela',
      subtext: 'Emergency lines, help centers and trusted resources near you.',
      emergency_heading: 'Emergencies',
      family_heading: 'Find your family',
      family_link: 'Search missing people →',
      family_sub: 'Search the gathered registries of people missing after the earthquake.',
      centers_heading: 'Collection & help centers in Venezuela',
      centers_note:
        'Verified points that receive and distribute supplies. Locations are shown approximately.',
      first_aid_heading: 'First aid',
      first_aid_link: 'First-aid guide →',
      first_aid_sub: 'Basic steps based on Red Cross, WHO and FEMA.',
      mental_health: 'Mental health',
      mental_health_note:
        'These are community support lines; they do not replace emergency clinical care.',
      structural: 'Structural inspection',
      structural_link: 'Request a building inspection →',
      structural_sub: 'A credentialed responder evaluates whether it is safe.',
      medical_rescue: 'Medical & rescue',
      news: 'News & information',
      footer_missing: 'Know a resource we’re missing?',
      footer_soon: 'You’ll be able to suggest it here soon.',
      footer_verified:
        'In the meantime, organizations are shown after being verified by a coordinator.',
    },
    primeros_auxilios: {
      heading: 'First aid',
      subtext:
        'Basic guide for the first minutes after an earthquake. Based on Red Cross, World Health Organization (WHO) and FEMA guidelines.',
      warning_label: 'Important:',
      warning:
        'This information is educational and does not replace professional care or a certified course. In an emergency call',
      warning_suffix: 'and follow Civil Protection and Fire Department instructions.',
      sources_heading: 'Sources',
      more_resources: 'See more emergency resources',
    },
    disclaimer: {
      label: 'Notice:',
      text: 'This is a community coordination tool, not an official certification. In an emergency call',
      number: '171',
      suffix: 'and follow Civil Protection and Fire Department instructions.',
    },
    footer: {
      text: 'Community coordination tool for earthquake response · Locations are shown approximately to protect people.',
    },
    principles: {
      heading: 'How we work',
      items: [
        {
          icon: '🛡️',
          title: 'Protected locations',
          text: 'The open map shows only approximate areas. Exact addresses are never exposed, so no report can be used against survivors.',
        },
        {
          icon: '🔒',
          title: 'Privacy first',
          text: 'No trackers, no ads, no data selling. What you share is used only to coordinate help.',
        },
        {
          icon: '🌐',
          title: 'Genuinely lightweight',
          text: 'Built to open fast even on weak signal or a limited data plan.',
        },
        {
          icon: '🤝',
          title: 'Help with no strings',
          text: 'Reaching help is always free. No one should have to pay to be assisted.',
        },
        {
          icon: '📖',
          title: 'First aid',
          text: 'Essential steps referenced from the Red Cross, WHO, and FEMA.',
          href: '/primeros-auxilios',
          cta: 'Open guide →',
        },
      ],
    },
    toggle: { to_en: 'EN', to_es: 'ES' },
    safety: {
      donation:
        'Never donate via wire transfer to personal accounts, gift cards, or cryptocurrency. Legitimate organizations use established donation platforms.',
      scamWarning:
        'Scammers create new accounts with names nearly identical to real organizations. Verify the organization appears in this list before donating.',
      skills:
        'Contact is anonymous and mediated. Never share your phone number, national ID, or exact address in messages.',
    },
  },
} as const;

export type Dict = (typeof dict)['es'];

/** Return the typed dictionary for the given locale. */
export function t(locale: Locale): Dict {
  return dict[locale] as unknown as Dict;
}
