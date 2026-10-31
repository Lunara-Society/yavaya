import type { MessageKey } from '@/i18n';
import type { LiveMapLabels } from '@/ui/go/live-map';

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

/** Every word of the live map, by the name the map uses for it. `satisfies` makes a missing one a compile error. */
const LIVE_MAP_KEYS = {
  aria: 'go.live.aria',
  statusTitle: 'go.live.status_title',
  labelMap: 'go.live.label_map',
  mapLoading: 'go.live.map_loading',
  mapReady: 'go.live.map_ready',
  mapFailed: 'go.live.map_failed',
  mapFailedLong: 'go.live.map_failed_long',
  retry: 'go.live.retry',
  labelProvider: 'go.live.label_provider',
  providerOk: 'go.live.provider_ok',
  providerTrouble: 'go.live.provider_trouble',
  providerDown: 'go.live.provider_down',
  labelData: 'go.live.label_data',
  dataLive: 'go.live.data_live',
  dataRetrying: 'go.live.data_retrying',
  dataOffline: 'go.live.data_offline',
  labelDeliveries: 'go.live.label_deliveries',
  deliveriesNone: 'go.live.deliveries_none',
  deliveriesCount: 'go.live.deliveries_count',
  activeHeadline: 'go.live.active_headline',
  labelDrivers: 'go.live.label_drivers',
  driversCount: 'go.live.drivers_count',
  driversFew: 'go.live.drivers_few',
  labelStores: 'go.live.label_stores',
  storesCount: 'go.live.stores_count',
  storesNone: 'go.live.stores_none',
  emptyTitle: 'go.live.empty_title',
  emptyText: 'go.live.empty_text',
  seeDemo: 'go.live.see_demo',
  privacy: 'go.live.privacy',
  howTitle: 'go.live.how_title',
  how1: 'go.live.how1',
  how2: 'go.live.how2',
  how3: 'go.live.how3',
  zoomIn: 'go.live.zoom_in',
  zoomOut: 'go.live.zoom_out',
  recenter: 'go.live.recenter',
  storeOpen: 'go.live.store_open',
  storeClosed: 'go.live.store_closed',
  storeView: 'go.live.store_view',
  demoBanner: 'go.live.demo_banner',
  demoMode: 'go.live.demo_mode',
  demoExit: 'go.live.demo_exit',
  demoPause: 'go.live.demo_pause',
  demoResume: 'go.live.demo_resume',
  demoRestart: 'go.live.demo_restart',
  demoEta: 'go.live.demo_eta',
  demoNote: 'go.live.demo_note',
  'demoPhase.to_pickup': 'go.live.demo_phase.to_pickup',
  'demoPhase.at_pickup': 'go.live.demo_phase.at_pickup',
  'demoPhase.to_dropoff': 'go.live.demo_phase.to_dropoff',
  'demoPhase.delivered': 'go.live.demo_phase.delivered',
  demoPickup: 'go.live.demo_pickup',
  demoDropoff: 'go.live.demo_dropoff',
  demoDriver: 'go.live.demo_driver',
  labelTracking: 'go.live.label_tracking',
  yourOrder: 'go.live.your_order',
  yourTrip: 'go.live.your_trip',
  trackLive: 'go.live.track_live',
  trackStale: 'go.live.track_stale',
  trackWaiting: 'go.live.track_waiting',
  trackNoDriver: 'go.live.track_no_driver',
  trackEnded: 'go.live.track_ended',
  trackRetrying: 'go.live.track_retrying',
  openDelivery: 'go.live.open_delivery',
  driverActive: 'go.live.driver_active',
  driverLink: 'go.live.driver_link',
  storeOwner: 'go.live.store_owner',
  storeLink: 'go.live.store_link',
  agoSeconds: 'go.live.ago_seconds',
  agoMinutes: 'go.live.ago_minutes',
} as const satisfies Record<keyof LiveMapLabels, MessageKey>;

export function liveMapLabels(t: T): LiveMapLabels {
  // The placeholders stay as they are: the map fills them in as figures change.
  const keep = { ago: '{ago}', count: '{count}', open: '{open}', minutes: '{minutes}', code: '{code}', n: '{n}' };
  return Object.fromEntries(Object.entries(LIVE_MAP_KEYS).map(([name, key]) => [name, t(key, keep)])) as LiveMapLabels;
}
