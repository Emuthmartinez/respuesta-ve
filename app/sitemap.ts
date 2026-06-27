import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://respuesta-ve.e-muth-martinez.workers.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const route = (
    path: string,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: number,
  ) => ({ url: `${BASE}${path}`, lastModified: now, changeFrequency, priority });

  return [
    route('/', 'hourly', 1.0),
    route('/reportar', 'monthly', 0.9),
    route('/afuera', 'daily', 0.9),
    route('/afuera/agregar-centro', 'monthly', 0.5),
    route('/intercambio', 'hourly', 0.8),
    route('/intercambio/necesitar', 'monthly', 0.7),
    route('/intercambio/ofrecer', 'monthly', 0.7),
    route('/recursos', 'daily', 0.8),
    route('/primeros-auxilios', 'monthly', 0.7),
    route('/personas', 'daily', 0.7),
    route('/red', 'weekly', 0.8),
    route('/desmentidos', 'daily', 0.7),
    route('/solicitar-inspeccion', 'monthly', 0.6),
    route('/voluntarios', 'weekly', 0.5),
  ];
}
