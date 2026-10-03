import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { HomeBody } from '@/ui/site/pages';
import { JsonLd } from '@/ui/site/json-ld';
import { servedCountryNames, siteUrl } from '@/server/seo';

/**
 * Yavaya home.
 *
 * Deliberately honest: districts are shown with their real status, and nothing
 * here claims activity, membership numbers or transactions that do not exist.
 * The second call to action is real: creating an account works.
 */
export default async function HomePage() {
  const { c, t, language, theme, member } = await siteContext();
  const primaryCta = member
    ? { href: '/account', label: t('nav.member_area') }
    : { href: '/register', label: t('auth.submit_register') };

  const base = siteUrl();
  const countries = await servedCountryNames();
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
          { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Yavaya', url: base, inLanguage: 'es' },
        ]}
      />
      <HomeBody c={c} primaryCta={primaryCta} />
    </SiteShell>
  );
}
