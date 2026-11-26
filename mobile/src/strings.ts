import { getLocales } from 'expo-localization';

/**
 * The few words the app itself says (everything else is the website, in the
 * language the person chose there). Spanish first, as on the site.
 */
export type Strings = {
  offlineTitle: string;
  offlineBody: string;
  retry: string;
  /** The reconstruction: what a screen reader hears, and the hint that a tap goes straight in. */
  loadingLabel: string;
  enterHint: string;
  roxiName: string;
  roxiRole: string;
  roxiOpen: string;
  /** The Synapse / Classic choice (long press on Roxi). */
  lookTitle: string;
  lookToClassic: string;
  lookToSynapse: string;
  lookClassic: string;
  lookSynapse: string;
  cancel: string;
};

const STRINGS: Record<'es' | 'en', Strings> = {
  es: {
    offlineTitle: 'Sin conexión',
    offlineBody: 'No pudimos abrir Yavaya. Revisa tu internet y vuelve a intentarlo.',
    retry: 'Reintentar',
    loadingLabel: 'Cargando Yavaya',
    enterHint: 'Toca para entrar',
    roxiName: 'Roxi',
    roxiRole: 'Asistente de Yavaya',
    roxiOpen: 'Hablar con Roxi',
    lookTitle: 'Apariencia de la app',
    lookToClassic: 'Synapse muestra a Roxi en persona. La versión clásica vuelve al botón de siempre.',
    lookToSynapse: 'Synapse muestra a Roxi en persona al abrir la app y en su botón.',
    lookClassic: 'Usar la clásica',
    lookSynapse: 'Usar Synapse',
    cancel: 'Cancelar',
  },
  en: {
    offlineTitle: 'No connection',
    offlineBody: "We couldn't open Yavaya. Check your internet and try again.",
    retry: 'Try again',
    loadingLabel: 'Loading Yavaya',
    enterHint: 'Tap to enter',
    roxiName: 'Roxi',
    roxiRole: "Yavaya's assistant",
    roxiOpen: 'Talk to Roxi',
    lookTitle: 'App appearance',
    lookToClassic: 'Synapse shows Roxi in person. The classic version goes back to the usual button.',
    lookToSynapse: 'Synapse shows Roxi in person when the app opens and on her button.',
    lookClassic: 'Use classic',
    lookSynapse: 'Use Synapse',
    cancel: 'Cancel',
  },
};

export function strings(): Strings {
  const language = getLocales()[0]?.languageCode ?? 'es';
  return language === 'en' ? STRINGS.en : STRINGS.es;
}
