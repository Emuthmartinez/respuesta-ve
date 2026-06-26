import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import { skillLabel } from '@/lib/skills';
import { getLocale } from '@/lib/i18n-server';
import { MyOfferCard } from '@/components/intercambio/MyOfferCard';

const STR = {
  es: {
    heading: 'Mis ofertas',
    subtext: 'Estas son las ofertas de ayuda que has registrado.',
    signInPrompt: 'Debes iniciar sesión para ver tus ofertas.',
    signIn: 'Iniciar sesión',
    empty: 'No tienes ofertas registradas todavía.',
    offerLink: 'Ofrecer ayuda',
    backToExchange: 'Intercambio',
  },
  en: {
    heading: 'My offers',
    subtext: 'These are the help offers you have registered.',
    signInPrompt: 'You must sign in to view your offers.',
    signIn: 'Sign in',
    empty: 'You have no registered offers yet.',
    offerLink: 'Offer help',
    backToExchange: 'Exchange',
  },
} as const;

interface SkillOffer {
  id: string;
  skill_category: string;
  skill_detail: string | null;
  estado: string | null;
  moderation_status: string | null;
  suspended_at: string | null;
  available: boolean;
  created_at: string;
}

export default async function MisOfertasPage() {
  const locale = await getLocale();
  const s = STR[locale];

  const sb = await getSupabaseServer();

  if (!sb) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">{s.signInPrompt}</p>
        <Link href="/voluntarios/acceder" className="mt-4 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
          {s.signIn}
        </Link>
      </div>
    );
  }

  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">{s.signInPrompt}</p>
        <Link href="/voluntarios/acceder" className="mt-4 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
          {s.signIn}
        </Link>
      </div>
    );
  }

  // Scope to the signed-in user's own offers explicitly. RLS also lets
  // coordinators SELECT all offers, so without this filter a coordinator
  // would see everyone's offers under "My offers".
  const { data } = await sb
    .from('skill_offers')
    .select('id, skill_category, skill_detail, estado, moderation_status, suspended_at, available, created_at')
    .eq('offerer_id', user.id)
    .order('created_at', { ascending: false });

  const offers = (data ?? []) as SkillOffer[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
        <Link href="/intercambio" className="text-xs text-zinc-500 underline">
          {s.backToExchange}
        </Link>
      </div>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{s.subtext}</p>

      {offers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500">{s.empty}</p>
          <Link href="/intercambio/ofrecer" className="mt-4 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
            {s.offerLink}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const isFinal =
              offer.moderation_status === 'archived' || !!offer.suspended_at;
            return (
              <MyOfferCard
                key={offer.id}
                offerId={offer.id}
                skillLabel={skillLabel(offer.skill_category, locale)}
                skillDetail={offer.skill_detail}
                estado={offer.estado}
                moderationStatus={offer.moderation_status}
                suspended={!!offer.suspended_at}
                available={offer.available}
                createdAt={offer.created_at}
                alreadyFinal={isFinal}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
