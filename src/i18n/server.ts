import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, negotiateLocale, type Locale } from './config';
import { createTranslator, type Translator } from './index';

export const LOCALE_COOKIE = 'yav_locale';

/**
 * Resolves the request's locale: an explicit user choice first, the browser's
 * preference second, Spanish last.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
  if (chosen && isLocale(chosen)) return chosen;

  const headerStore = await headers();
  return negotiateLocale(headerStore.get('accept-language')) ?? DEFAULT_LOCALE;
}

export async function getTranslator(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await resolveLocale();
  return { locale, t: createTranslator(locale) };
}
