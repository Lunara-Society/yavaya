import type { Metadata } from 'next';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { AnimalsBody } from '@/ui/site/pages';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.animals.title, description: c.pages.animals.description };
}

export default async function Page() {
  const { c, t, language, theme, member } = await siteContext();
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <AnimalsBody c={c} />
    </SiteShell>
  );
}
