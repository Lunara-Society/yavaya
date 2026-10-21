/**
 * The rules for what a visit statistic may contain. Pure functions, so the
 * endpoint and the tests share them.
 *
 * Everything that arrives is written by a browser, which means by anyone:
 * each field is checked against a short list or a strict pattern, and
 * anything else is dropped rather than stored.
 */

export const DEVICES = ['phone', 'tablet', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export const METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type Metric = (typeof METRICS)[number];

/**
 * The bands the web's own guidance draws for each measure (web.dev, "Web
 * Vitals"): at or under the first number is good, over the second is poor.
 * Milliseconds, except CLS, which has no unit. Not a Yavaya decision, so not
 * a business rule: changing these would only make Yavaya's numbers
 * incomparable with everyone else's.
 */
export const METRIC_BANDS: Record<Metric, { good: number; poor: number; max: number }> = {
  LCP: { good: 2500, poor: 4000, max: 120_000 },
  INP: { good: 200, poor: 500, max: 60_000 },
  CLS: { good: 0.1, poor: 0.25, max: 10 },
  FCP: { good: 1800, poor: 3000, max: 120_000 },
  TTFB: { good: 800, poor: 1800, max: 120_000 },
};

export type Band = 'good' | 'needsImprovement' | 'poor';

export function band(metric: Metric, value: number): Band {
  const { good, poor } = METRIC_BANDS[metric];
  if (value <= good) return 'good';
  return value > poor ? 'poor' : 'needsImprovement';
}

/**
 * Pages never counted: Espacio Violeta, where even "someone was here" is not
 * Yavaya's to keep; the panels, where the team would mostly count itself; and
 * the API.
 */
const NEVER = /^\/(violeta|admin|api)(\/|$)/;

/**
 * A page's route as the browser reports it: ids already replaced by their
 * name (`/mercadito/[id]`). Letters, digits, dashes, underscores and
 * brackets only, at most eight segments — so a stored path can never be a
 * search, an email address or a listing's title.
 */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 120) return null;
  const path = raw === '/' ? '/' : raw.replace(/\/+$/, '');
  if (!/^\/[A-Za-z0-9_\-[\]/]*$/.test(path)) return null;
  if (path.split('/').length - 1 > 8 || path.includes('//')) return null;
  if (NEVER.test(path)) return null;
  return path;
}

export function cleanDevice(raw: unknown): Device | null {
  return typeof raw === 'string' && (DEVICES as readonly string[]).includes(raw) ? (raw as Device) : null;
}

/** Sites people commonly arrive from, under one name each however they spell their host. */
const KNOWN_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android/, 'google'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(whatsapp\.com|wa\.me)$|^com\.whatsapp/, 'whatsapp'],
  [/(^|\.)(tiktok\.com)$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.com$/, 'yahoo'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'chatgpt'],
];

/**
 * Where a visit came from, from the referring site's host name (the browser
 * sends the host only, never the address). `ownHosts` are Yavaya's own:
 * arriving from them is not a new visit. Empty means no referrer at all —
 * typed, bookmarked, or opened from an app that does not say.
 */
export function cleanSource(raw: unknown, ownHosts: readonly string[]): string | null {
  if (raw === '' || raw === undefined || raw === null) return 'direct';
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const host = raw.toLowerCase().trim();
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (ownHosts.includes(host)) return '';
  for (const [pattern, name] of KNOWN_SOURCES) if (pattern.test(host)) return name;
  return host.replace(/^(www|m|l|lm|mobile|web)\./, '').slice(0, 60);
}

export function cleanVital(metric: unknown, value: unknown): { metric: Metric; value: number } | null {
  if (typeof metric !== 'string' || !(METRICS as readonly string[]).includes(metric)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const m = metric as Metric;
  if (value > METRIC_BANDS[m].max) return null;
  return { metric: m, value };
}

/** Automated visitors that run scripts. Most bots run none and never reach the endpoint at all. */
export const AUTOMATED = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|phantomjs|puppeteer|playwright/i;
