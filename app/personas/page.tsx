import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Personas — Respuesta VE' };

export default function PersonasPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Personas desaparecidas</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Para no fragmentar la búsqueda, <strong>no creamos un registro
        separado</strong>. Conectamos y enlazamos los esfuerzos que ya existen,
        para que las familias busquen en un solo lugar.
      </p>

      <div className="mt-6 space-y-3">
        <a
          href="https://venezuelatebusca.com"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          <div className="font-medium">Venezuela Te Busca →</div>
          <div className="text-sm text-zinc-500">Registro comunitario de personas.</div>
        </a>
        <a
          href="https://google.org/personfinder/"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          <div className="font-medium">Google Person Finder →</div>
          <div className="text-sm text-zinc-500">
            Estándar abierto (PFIF) para intercambiar datos entre registros.
          </div>
        </a>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-black/15 p-4 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-400">
        <strong>Próximamente:</strong> pines de “visto por última vez” en el mapa,
        enlazados a estos registros, e ingesta automática vía PFIF.
        <div className="mt-3">
          <Link href="/" className="font-medium text-red-600 hover:underline">
            Volver al mapa
          </Link>
        </div>
      </div>
    </div>
  );
}
