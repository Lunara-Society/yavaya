/**
 * How much of the First Light a device is given. Every tier has the same page
 * — the same links, search, doors and words — only the decoration changes:
 *
 *   full   the layered Guardian breathing, light that follows the pointer or
 *          finger, drifting mist, the feather light maps.
 *   lite   the same picture, still; the opening light and the doors' own
 *          transitions, nothing continuous. What an inexpensive phone, a
 *          slow connection or Data Saver gets.
 *   still  no movement at all: what someone who asked their device for less
 *          motion gets, whatever the device.
 *
 * The page is served as `lite` and upgraded on the device, so a phone that
 * cannot afford the decoration never downloads it.
 */
export type Tier = 'full' | 'lite' | 'still';

export type DeviceSignals = {
  reducedMotion: boolean;
  /** navigator.connection.saveData */
  saveData?: boolean;
  /** navigator.connection.effectiveType: 'slow-2g' | '2g' | '3g' | '4g' */
  effectiveType?: string;
  /** navigator.deviceMemory, in GB (Chromium only; rounded down by the browser) */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency */
  cores?: number;
};

const SLOW_NETWORKS = new Set(['slow-2g', '2g', '3g']);

export function chooseTier(signals: DeviceSignals): Tier {
  if (signals.reducedMotion) return 'still';
  if (signals.saveData) return 'lite';
  if (signals.effectiveType && SLOW_NETWORKS.has(signals.effectiveType)) return 'lite';
  // Browsers that do not report memory or cores (Safari) are not assumed to be weak.
  if (typeof signals.deviceMemory === 'number' && signals.deviceMemory <= 2) return 'lite';
  if (typeof signals.cores === 'number' && signals.cores <= 2) return 'lite';
  return 'full';
}

/** Reads the signals in a browser; on the server everything is unknown. */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') return { reducedMotion: false };
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  };
}
