import { DEFAULT_LOCALE, type Locale } from './config';
import { es, type Dictionary, type MessageKey } from './dictionaries/es';
import { en } from './dictionaries/en';

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Builds a translator for a locale.
 *
 * Interpolation is `{name}`. A missing key returns the key itself rather than
 * an empty string or a crash — a visible `district.foo.name` in the interface
 * is an obvious bug report, whereas a blank space hides the problem.
 */
export function createTranslator(locale: Locale): Translator {
  const dictionary = getDictionary(locale);
  return (key, params) => {
    const template = dictionary[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };
}

export type { Dictionary, MessageKey };
export { DEFAULT_LOCALE };
export type { Locale };
