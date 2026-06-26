import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Respuesta VE — Terremoto Venezuela 2026',
    short_name: 'Respuesta VE',
    description: 'Plataforma comunitaria de coordinación para el terremoto en Venezuela: mapa de daños, donaciones, recursos y ayuda mutua.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#dc2626',
    lang: 'es',
    categories: ['emergency', 'humanitarian', 'utilities'],
  };
}
