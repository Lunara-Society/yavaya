import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { HomeBody } from '@/ui/site/home';
import { JsonLd } from '@/ui/site/json-ld';
import { db } from '@/server/db/client';
import { recentOpportunities } from '@/server/domains/discovery/recent';
import { servedCountryNames, siteUrl } from '@/server/seo';

/** How many recent things the home page shows: two rows of four on a wide screen. */
const RECENT_LIMIT = 8;

/**
 * Yavaya home.
 *
 * Deliberately honest: districts are shown with their real status, the recent
 * list is read from what has actually been published, and nothing here claims
 * activity, membership numbers or transactions that do not exist.
 */
export default async function HomePage() {
  const { c, t, locale, language, theme, member } = await siteContext();
  const base = siteUrl();
  const [countries, opportunities] = await Promise.all([servedCountryNames(), recentOpportunities(db(), { locale, limit: RECENT_LIMIT })]);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="home">
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Yavaya',
            url: base,
            logo: `${base}/icon-512.png`,
            description: 'El hogar digital de Centroamérica: mercado, servicios, trabajo, comunidad, fe y animales, con una sola cuenta y una sola reputación.',
            ...(countries.length ? { areaServed: countries } : {}),
            contactPoint: [{ '@type': 'ContactPoint', telephone: '+505-5836-5522', contactType: 'customer support', availableLanguage: ['Spanish', 'English'] }],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Yavaya',
            url: base,
            inLanguage: 'es',
            // The hero's search is Mercadito's: say so to search engines as well.
            potentialAction: { '@type': 'SearchAction', target: `${base}/mercadito?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
          },
        ]}
      />
      <HomeBody c={c} t={t} locale={locale} signedIn={Boolean(member)} opportunities={opportunities} />
    </SiteShell>
  );
}
