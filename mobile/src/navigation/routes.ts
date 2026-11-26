/**
 * Routes of the native shell. Pure data and functions (tested), so deep links,
 * the Android back button and transitions all agree on what a place is.
 */
export type Route =
  | { name: 'home' }
  | { name: 'district'; id: string }
  | { name: 'listing'; district: string; id: string }
  | { name: 'profile'; yayId: string }
  | { name: 'search'; q?: string }
  | { name: 'map'; iso?: string }
  | { name: 'roxi' }
  | { name: 'settings' }
  | { name: 'lab'; section?: string }
  | { name: 'web'; path: string };

export type RouteName = Route['name'];

/** Spatial depth of a place: deeper places open forward, shallower ones return. */
const DEPTH: Record<RouteName, number> = {
  home: 0, search: 1, map: 1, roxi: 1, settings: 1, lab: 1, district: 1, listing: 2, profile: 2, web: 3,
};
export const depthOf = (route: Route): number => DEPTH[route.name];

export const routeKey = (route: Route): string => {
  switch (route.name) {
    case 'district': return `district:${route.id}`;
    case 'listing': return `listing:${route.district}:${route.id}`;
    case 'profile': return `profile:${route.yayId}`;
    case 'search': return 'search';
    case 'lab': return `lab:${route.section ?? ''}`;
    case 'web': return `web:${route.path}`;
    default: return route.name;
  }
};

const SAFE_SEGMENT = /^[a-z0-9-]{1,40}$/;
const YAY_ID = /^\d{8}$/;
const NATIVE_DISTRICTS = new Set([
  'mercadito', 'services', 'work', 'yavayago', 'community', 'sanctuary', 'animals',
  'hogar', 'movilidad', 'salud', 'aprender', 'negocios', 'campo', 'barrio', 'diaspora',
]);

/**
 * yavaya://district/mercadito, https://yavaya.lat/mercadito, /members/12345678 …
 * Anything not understood natively falls back to the website screen for the
 * same path on Yavaya's own host; foreign hosts are refused (null).
 */
export function parseUrl(url: string, allowedHosts: readonly string[] = ['yavaya.lat', 'www.yavaya.lat']): Route | null {
  let path: string;
  let query = '';
  const custom = url.match(/^yavaya(?:-dev)?:\/\/(.*)$/);
  if (custom) {
    const [p, q = ''] = custom[1].split('?');
    path = `/${p.replace(/^\/+/, '')}`;
    query = q;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) return null;
    path = parsed.pathname;
    query = parsed.search.slice(1);
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [head, a, b] = parts;
  // The sign-in return address (business/auth.tsx) belongs to the browser hand-off, never to navigation:
  // opening it as a page would hand its one-time code to a screen.
  if (head === 'auth') return null;
  if (head === 'district' && a && NATIVE_DISTRICTS.has(a)) return { name: 'district', id: a };
  if (NATIVE_DISTRICTS.has(head) && parts.length === 1) return { name: 'district', id: head };
  if (head === 'search') return { name: 'search', q: new URLSearchParams(query).get('q') ?? undefined };
  if (head === 'map') return { name: 'map' };
  if (head === 'roxi') return { name: 'roxi' };
  if (head === 'lab') return { name: 'lab', section: a && SAFE_SEGMENT.test(a) ? a : undefined };
  if (head === 'members' && a && YAY_ID.test(a)) return { name: 'profile', yayId: a };
  if (head === 'listing' && a && b && NATIVE_DISTRICTS.has(a) && SAFE_SEGMENT.test(b)) return { name: 'listing', district: a, id: b };
  return { name: 'web', path: `/${parts.map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}` };
}

/** The website path that shows the same place, for the fallback screen and sharing. */
export function webPathOf(route: Route): string {
  switch (route.name) {
    case 'home': return '/';
    case 'district': return `/${route.id}`;
    case 'listing': return `/${route.district}`;
    case 'profile': return `/members/${route.yayId}`;
    case 'search': return route.q ? `/mercadito?q=${encodeURIComponent(route.q)}` : '/mercadito';
    case 'map': return '/yavayago';
    case 'web': return route.path;
    default: return '/';
  }
}

export type Direction = 'forward' | 'back' | 'lateral';

export function directionOf(from: Route | undefined, to: Route): Direction {
  if (!from) return 'forward';
  const d = depthOf(to) - depthOf(from);
  return d > 0 ? 'forward' : d < 0 ? 'back' : 'lateral';
}
