import type { Metadata } from 'next';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { TokensBody } from '@/ui/site/pages';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.tokens.title, description: c.pages.tokens.description };
}

export default async function Page() {
  const { c, t, locale, language, theme, member } = await siteContext();
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="tokens">
      <TokensBody c={c} film={<GuideVideo guideKey="confianza" title={t('guide.watch_title_trust')} t={t} locale={locale} />} />
    </SiteShell>
  );
}
