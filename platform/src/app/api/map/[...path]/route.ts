import { siteUrl } from '@/server/seo';

export const dynamic = 'force-dynamic';

/**
 * Map tiles, fonts and icons, fetched from OpenFreeMap and served from this
 * origin.
 *
 * Yavaya's pages contact no third party from the browser (see the CSP in
 * middleware.ts). A map drawn straight from a tile server would tell that
 * server where every visitor is looking — including, on a tracking page,
 * where a customer lives. Going through here, the tile server sees Yavaya,
 * not the visitor.
 *
 * Only these shapes of path are forwarded. Anything else is a 404, so this
 * can never be used to fetch an arbitrary address.
 */
const UPSTREAM = 'https://tiles.openfreemap.org';

const ALLOWED: Array<{ pattern: RegExp; type: 'json' | 'binary'; maxAge: number }> = [
  { pattern: /^styles\/(dark|liberty|positron)$/, type: 'json', maxAge: 3600 },
  { pattern: /^planet$/, type: 'json', maxAge: 3600 },
  // Versioned: a tile under a dated path never changes.
  { pattern: /^planet\/[0-9_a-z]+\/\d{1,2}\/\d{1,7}\/\d{1,7}\.pbf$/, type: 'binary', maxAge: 7 * 86400 },
  { pattern: /^fonts\/[A-Za-z0-9 %,_-]+\/\d{1,5}-\d{1,5}\.pbf$/, type: 'binary', maxAge: 30 * 86400 },
  { pattern: /^sprites\/[a-z0-9_]+\/[a-z0-9_]+(@2x)?\.(json|png)$/, type: 'binary', maxAge: 7 * 86400 },
  { pattern: /^natural_earth\/[a-z0-9]+\/\d{1,2}\/\d{1,4}\/\d{1,4}\.png$/, type: 'binary', maxAge: 30 * 86400 },
];

/**
 * The origin the map's requests must go to, so they stay same-origin. In
 * production it is always the site's own address (APP_URL; www redirects to
 * it): a forged Host header must never write another address into a cached
 * response. In development, whatever host the page was opened on.
 */
function publicOrigin(request: Request): string {
  const site = new URL(siteUrl());
  if (process.env.NODE_ENV === 'production') return site.origin;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.map((part) => decodeURIComponent(part)).join('/');
  if (joined.includes('..')) return new Response(null, { status: 404 });
  const rule = ALLOWED.find((candidate) => candidate.pattern.test(joined));
  if (!rule) return new Response(null, { status: 404 });

  const get = () =>
    fetch(`${UPSTREAM}/${path.join('/')}`, {
      headers: { Accept: rule.type === 'json' ? 'application/json' : '*/*', 'User-Agent': 'Yavaya (+https://yavaya.lat)' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    }).catch(() => null);
  // One retry: a map missing its icons or a few tiles because of a single
  // upstream hiccup is worse than a request that takes a little longer.
  let upstream = await get();
  if (!upstream || upstream.status >= 500) upstream = await get();
  if (!upstream || !upstream.ok) return new Response(null, { status: upstream?.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } });

  const headers = new Headers({
    'Cache-Control': `public, max-age=${rule.maxAge}`,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  });
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  if (rule.type === 'json') {
    // The style and tile index name their resources by the upstream address;
    // point every one of them back here.
    const origin = publicOrigin(request);
    const body = (await upstream.text()).replaceAll(`${UPSTREAM}/`, `${origin}/api/map/`);
    headers.set('Content-Type', 'application/json');
    return new Response(body, { headers });
  }
  // fetch() has already undone any compression, so the encoding header is not
  // forwarded; the body is buffered so a broken upstream stream fails here.
  return new Response(new Uint8Array(await upstream.arrayBuffer()), { headers });
}
