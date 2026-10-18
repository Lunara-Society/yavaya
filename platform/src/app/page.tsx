import Link from 'next/link';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { guideFiles } from '@/config/guide';
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
      <HomeBody
        c={c}
        primaryCta={primaryCta}
        afterHero={
          <section className="section">
            <div className="wrap gv-band">
              <Link href="/guia" aria-label={t('guide.home_cta')}>
                <img src={guideFiles('guia').poster} alt="" width={1280} height={720} loading="lazy" />
              </Link>
              <div>
                <p className="eyebrow">{t('guide.home_eyebrow')}</p>
                <h2 className="h-md">{t('guide.home_title')}</h2>
                <p className="lead">{t('guide.home_text')}</p>
                <p className="btn-row">
                  <Link className="btn btn-gold" href="/guia">
                    ▶ {t('guide.home_cta')}
                  </Link>
                </p>
              </div>
            </div>
          </section>
        }
      />
    </SiteShell>
  );
}
