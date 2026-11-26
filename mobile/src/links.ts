/**
 * Where a link opens (docs/synapse/ARCHITECTURE.md, "The bridge"): Yavaya's own
 * pages and Stripe's checkout stay inside the app; every other site and every
 * app link (WhatsApp, phone, mail, maps) goes to the phone's own app or browser,
 * so the person never ends up browsing the web inside Yavaya.
 *
 * Parsed by hand rather than with URL: React Native's URL is incomplete on some
 * engines, and this runs on every navigation.
 */

export type LinkDecision = 'in-app' | 'external' | 'block';

/** Top-level pages that may open inside the app. Stripe's are the hosted checkout and its 3-D Secure steps. */
export const IN_APP_HOSTS: readonly string[] = ['yavaya.lat', 'www.yavaya.lat', 'checkout.stripe.com', 'hooks.stripe.com', 'pay.stripe.com'];

// The scheme, and the host when there is one (any user@ part skipped).
// Matches "https://yavaya.lat/x" (https, yavaya.lat) and "tel:+505" (tel, no host); rejects "not a url".
// Try it: https://regex101.com/?flavor=javascript&flags=i&regex=%5E%28%5Ba-z%5D%5Ba-z0-9%2B.-%5D*%29%3A%28%3F%3A%5C%2F%5C%2F%28%3F%3A%5B%5E%2F%3F%23%40%5D*%40%29%3F%28%5B%5E%2F%3F%23%3A%5D*%29%29%3F&testString=https%3A%2F%2Fuser%40yavaya.lat%2Fx
const SCHEME_AND_HOST = /^([a-z][a-z0-9+.-]*):(?:\/\/(?:[^/?#@]*@)?([^/?#:]*))?/i;

export function decide(url: string, isTopFrame = true): LinkDecision {
  // Frames inside a page (Stripe's card field, an embedded map) belong to that page.
  if (!isTopFrame) return 'in-app';
  const match = SCHEME_AND_HOST.exec(url.trim());
  if (!match) return 'block';
  const scheme = match[1]!.toLowerCase();
  const host = (match[2] ?? '').toLowerCase();
  if (scheme === 'about' || scheme === 'data' || scheme === 'blob') return 'in-app';
  if (scheme === 'javascript' || scheme === 'file' || scheme === 'content') return 'block';
  if (scheme === 'https' || scheme === 'http') return IN_APP_HOSTS.includes(host) ? 'in-app' : 'external';
  // whatsapp:, tel:, mailto:, sms:, geo:, intent: — the phone's own apps.
  return 'external';
}

/** Yavaya's own website: the only pages allowed to send the app messages. */
const YAVAYA_HOSTS: readonly string[] = ['yavaya.lat', 'www.yavaya.lat'];

export function isYavaya(url: string): boolean {
  const match = SCHEME_AND_HOST.exec(url.trim());
  if (!match) return false;
  return match[1]!.toLowerCase() === 'https' && YAVAYA_HOSTS.includes((match[2] ?? '').toLowerCase());
}

/**
 * Android "intent:" links cannot be opened as they are; their browser fallback
 * can (S.browser_fallback_url). Anything else is returned unchanged.
 */
export function openableUrl(url: string): string | null {
  if (!url.toLowerCase().startsWith('intent:')) return url;
  // The encoded fallback address inside an intent link, up to the next ";".
  // Matches "…;S.browser_fallback_url=https%3A%2F%2Fyavaya.lat;end" (captures the encoded URL); rejects "…;scheme=zxing;end".
  // Try it: https://regex101.com/?flavor=javascript&regex=%3BS%5C.browser_fallback_url%3D%28%5B%5E%3B%5D%2B%29&testString=intent%3A%2F%2Fscan%2F%23Intent%3Bscheme%3Dzxing%3BS.browser_fallback_url%3Dhttps%253A%252F%252Fyavaya.lat%3Bend
  const fallback = /;S\.browser_fallback_url=([^;]+)/.exec(url);
  if (!fallback) return null;
  try {
    return decodeURIComponent(fallback[1]!);
  } catch {
    return null;
  }
}
