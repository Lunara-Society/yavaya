import { getLocales } from 'expo-localization';

/**
 * The few words the app itself says (everything else is the website, in the
 * language the person chose there). Spanish first, as on the site.
 */
export type Strings = { offlineTitle: string; offlineBody: string; retry: string };

const STRINGS: Record<'es' | 'en', Strings> = {
  es: {
    offlineTitle: 'Sin conexión',
    offlineBody: 'No pudimos abrir Yavaya. Revisa tu internet y vuelve a intentarlo.',
    retry: 'Reintentar',
  },
  en: {
    offlineTitle: 'No connection',
    offlineBody: "We couldn't open Yavaya. Check your internet and try again.",
    retry: 'Try again',
  },
};

export function strings(): Strings {
  const language = getLocales()[0]?.languageCode ?? 'es';
  return language === 'en' ? STRINGS.en : STRINGS.es;
}
