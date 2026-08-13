import 'server-only';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { DEFAULT_LOCALE, negotiateLocale, type Locale } from '@/i18n/config';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  DEFAULT_THEME_PREFERENCE,
  isLanguagePreference,
  isThemePreference,
  themeAttributeFor,
  type LanguagePreference,
  type ThemePreference,
} from '@/config/preferences';

/**
 * Reading and writing display preferences.
 *
 * Both default to following the device. An explicit choice overrides that and
 * is remembered — in a cookie so it works before sign-in, and on the account so
 * it follows the member to another device.
 *
 * Neither preference is a secret, so the cookies are not `httpOnly`.
 */

export const LOCALE_COOKIE = 'yav_locale';
export const THEME_COOKIE = 'yav_theme';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type { LanguagePreference, ThemePreference };
export { isLanguagePreference, isThemePreference };

/** What the member chose, independent of what it resolves to. */
export async function readLanguagePreference(): Promise<LanguagePreference> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  return stored && isLanguagePreference(stored) ? stored : DEFAULT_LANGUAGE_PREFERENCE;
}

export async function readThemePreference(): Promise<ThemePreference> {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  return stored && isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
}

/**
 * The locale to render in.
 *
 * `auto` negotiates against `Accept-Language`, which on a phone reflects the
 * device's language setting. Spanish is the fallback because Yavaya's users
 * are in Central America — not English.
 */
export async function resolveLocale(): Promise<Locale> {
  const preference = await readLanguagePreference();
  if (preference !== 'auto') return preference;

  const headerStore = await headers();
  return negotiateLocale(headerStore.get('accept-language')) ?? DEFAULT_LOCALE;
}

/**
 * The theme attribute for `<html>`, resolved on the server before the first
 * byte — so the correct palette is in the first paint, with no flash and no
 * render-blocking inline script.
 */
export async function resolveThemeAttribute(): Promise<'light' | 'dark' | null> {
  return themeAttributeFor(await readThemePreference());
}

export async function writeLanguagePreference(preference: LanguagePreference): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, preference, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  });
}

export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE, preference, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  });
}

/**
 * Mirrors a preference onto the account so it follows the member to another
 * device. The cookie stays authoritative for the current request.
 */
export async function persistPreferencesToAccount(
  userId: string,
  preferences: { locale?: Locale; theme?: ThemePreference },
): Promise<void> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (preferences.locale) patch.locale = preferences.locale;
  if (preferences.theme) patch.themePreference = preferences.theme;
  if (Object.keys(patch).length === 0) return;

  await db()
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
