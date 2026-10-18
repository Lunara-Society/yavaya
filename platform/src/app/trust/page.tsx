import type { Metadata } from 'next';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { TrustBody } from '@/ui/site/pages';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.trust.title, description: c.pages.trust.description };
}

export default async function Page() {
  const { c, t, locale, language, theme, member } = await siteContext();
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="trust">
      <TrustBody
        c={c}
        afterHero={
          <div className="wrap">
            <GuideVideo guideKey="confianza" title={t('guide.watch_title_trust')} t={t} locale={locale} />
          </div>
        }
      />
    </SiteShell>
  );
}
