import '../home-header.css';
import './first-light.css';
import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { locationBarProps } from '@/ui/site/location-props';
import { FirstLightBody } from '@/ui/first-light/first-light';

/**
 * The First Light — the cinematic home page, as a preview (docs/FIRST-LIGHT.md).
 *
 * Its own address while it is tried on real phones; the current home page at
 * "/" is untouched and stays the home page until the owner decides otherwise.
 * Not indexed, so search engines keep showing the real home page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('firstlight.meta.title'), description: t('firstlight.meta.description'), robots: { index: false, follow: true } };
}

export default async function FirstLightPage() {
  const { c, t, locale, language, theme, member } = await siteContext();
  const location = await locationBarProps(t, locale);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="home" home>
      <FirstLightBody c={c} t={t} signedIn={Boolean(member)} location={location} />
    </SiteShell>
  );
}
