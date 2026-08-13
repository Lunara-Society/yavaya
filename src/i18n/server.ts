import { resolveLocale } from '@/server/preferences';
import { createTranslator, type Translator } from './index';
import type { Locale } from './config';

/**
 * Server-side translation entry point.
 *
 * Locale resolution lives in `server/preferences.ts` because it is one half of
 * a pair with the theme preference; this module is the i18n-facing view of it.
 */
export async function getTranslator(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await resolveLocale();
  return { locale, t: createTranslator(locale) };
}

export { resolveLocale };
