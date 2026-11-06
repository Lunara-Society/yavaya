import './home-header.css';
import './home.css';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { SOCIAL } from '@/config/social';
import { HomeBody } from '@/ui/site/home';
import { JsonLd } from '@/ui/site/json-ld';
import { locationBarProps } from '@/ui/site/location-props';
import { servedCountryNames, siteUrl } from '@/server/seo';

/**
 * Yavaya home: the owner's design of 31 October 2026 (ui/site/home.tsx).
 *
 * Deliberately honest: every district card leads into the district itself,
 * one that is not open says so, the search is Mercadito's and labelled as
 * such, and nothing here claims activity, membership numbers or transactions
 * that do not exist.
 */
export default async function HomePage() {
  const { c, t, locale, language, theme, member } = await siteContext();
  const base = siteUrl();
  const [countries, location] = await Promise.all([servedCountryNames(), locationBarProps(t, locale)]);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="home" home>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Yavaya',
            url: base,
            logo: `${base}/icon-512.png`,
            sameAs: [SOCIAL.instagram.url],
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
      <HomeBody c={c} t={t} signedIn={Boolean(member)} location={location} />
    </SiteShell>
  );
}
