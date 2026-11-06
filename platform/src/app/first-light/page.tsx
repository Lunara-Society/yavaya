import '../home-header.css';
import './first-light.css';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n/server';
import { db } from '@/server/db/client';
import { lookEnabled } from '@/server/domains/platform/looks';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { locationBarProps } from '@/ui/site/location-props';
import { FirstLightBody } from '@/ui/first-light/first-light';

/**
 * The First Light as a preview (docs/FIRST-LIGHT.md), for while the owner's
 * switch has the previous home page at "/": a way to look at it before
 * turning it back on. While it is the home page, this address leads there.
 * Never indexed, so search engines only know the real home page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('firstlight.meta.title'), description: t('firstlight.meta.description'), robots: { index: false, follow: true } };
}

export default async function FirstLightPage() {
  if (await lookEnabled(db(), 'home')) redirect('/');
  const { c, t, locale, language, theme, member } = await siteContext();
  const location = await locationBarProps(t, locale);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="home" home>
      <FirstLightBody c={c} t={t} signedIn={Boolean(member)} location={location} guardian={(await lookEnabled(db(), 'guardian')) ? 'second' : 'first'} preview />
    </SiteShell>
  );
}
