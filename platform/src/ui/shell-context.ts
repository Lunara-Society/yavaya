import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { getTranslator } from '@/i18n/server';
import type { Locale, Translator } from '@/i18n';
import {
  readLanguagePreference,
  readThemePreference,
  type LanguagePreference,
  type ThemePreference,
} from '@/server/preferences';
import { currentSession } from '@/server/auth/context';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { unreadCount } from '@/server/domains/notifications/service';
import type { ShellMember } from './components/app-shell';

export type ShellContext = {
  locale: Locale;
  t: Translator;
  language: LanguagePreference;
  theme: ThemePreference;
  member: ShellMember;
  /** Internal id, for pages that need to load the member's own data. */
  userId: string | null;
};

/**
 * Everything the shell needs, gathered once per page.
 *
 * Pages call this instead of assembling the pieces themselves, so no page can
 * accidentally render the shell without the current language, theme or
 * sign-in state.
 *
 * The member summary carries only what the header displays. Anything more
 * belongs to the page that actually needs it.
 */
export async function shellContext(): Promise<ShellContext> {
  const [{ locale, t }, language, theme, session] = await Promise.all([
    getTranslator(),
    readLanguagePreference(),
    readThemePreference(),
    currentSession(),
  ]);

  if (!session) {
    return { locale, t, language, theme, member: null, userId: null };
  }

  const [[row], unread] = await Promise.all([
    db().select({ displayName: users.displayName }).from(users).where(eq(users.id, session.user.userId)).limit(1),
    unreadCount(db(), session.user.userId),
  ]);

  return {
    locale,
    t,
    language,
    theme,
    userId: session.user.userId,
    member: {
      yayId: formatYayId(session.user.yayId),
      displayName: row?.displayName ?? '',
      unread,
    },
  };
}
