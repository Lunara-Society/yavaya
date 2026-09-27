import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import { siteContent } from '@/i18n/site';
import { resolveLocale, type LanguagePreference, type ThemePreference } from '@/server/preferences';
import { SiteShell, type ShellMember } from '@/ui/site/site-shell';

export type { ShellMember };

/**
 * The frame for the member area and the sign-in pages.
 *
 * It is the website's own shell, so moving from a public page into an account
 * never feels like leaving for another product. The content keeps a narrower
 * column, suited to forms and account details.
 */
export async function AppShell({
  t,
  language,
  theme,
  member,
  district,
  children,
}: {
  t: Translator;
  language: LanguagePreference;
  theme: ThemePreference;
  member: ShellMember;
  /** Applies the district's colour world to everything inside. */
  district?: string;
  children: ReactNode;
}) {
  const c = siteContent(await resolveLocale());
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} district={district}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-20">{children}</div>
    </SiteShell>
  );
}
