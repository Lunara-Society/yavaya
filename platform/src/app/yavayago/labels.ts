import type { MessageKey } from '@/i18n';

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** The words the map component shows, translated on the server and passed down. */
export function mapLabels(t: T): Record<string, string> {
  return {
    aria: t('go.map.aria'),
    useMyLocation: t('go.map.use_my_location'),
    pickHint: t('go.map.pick_hint'),
    noGeolocation: t('go.map.no_geolocation'),
    locationDenied: t('go.map.location_denied'),
    sharing: t('go.map.sharing'),
    offline: t('go.map.offline'),
    seen: t('go.map.seen'),
  };
}
