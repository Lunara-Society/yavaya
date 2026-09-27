import 'server-only';
import { siteContent, type SiteContent } from '@/i18n/site';
import { shellContext, type ShellContext } from '@/ui/shell-context';

export type SiteContext = ShellContext & { c: SiteContent };

/** Everything a public page needs: the shell context plus the site content. */
export async function siteContext(): Promise<SiteContext> {
  const shell = await shellContext();
  return { ...shell, c: siteContent(shell.locale) };
}
