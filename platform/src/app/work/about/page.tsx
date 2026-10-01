import type { Metadata } from 'next';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { WorkBody } from '@/ui/site/pages';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.work.title, description: c.pages.work.description };
}

export default async function Page() {
  const { c, t, language, theme, member } = await siteContext();
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <WorkBody c={c} />
    </SiteShell>
  );
}
