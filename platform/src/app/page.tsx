import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { HomeBody } from '@/ui/site/pages';

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

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="home">
      <HomeBody c={c} primaryCta={primaryCta} />
    </SiteShell>
  );
}
