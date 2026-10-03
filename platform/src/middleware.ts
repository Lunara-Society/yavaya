import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: preview access gate, then Content-Security-Policy.
 *
 * Runs in the edge runtime, so it uses Web APIs only — no `node:crypto`, no
 * database, no imports from the server tree.
 */

const PREVIEW_COOKIE = 'yav_preview';
const PREVIEW_PARAM = 'key';

/**
 * Paths that must stay reachable without the preview key.
 * The health endpoint is here because the platform's probe cannot hold a
 * cookie, and an unreachable probe means the deploy never goes healthy.
 */
const PREVIEW_EXEMPT = ['/api/health', '/robots.txt', '/sitemap.xml'];
/** Payment providers' notifications: they cannot hold a cookie either, and carry their own signature. */
const PREVIEW_EXEMPT_PATTERN = /^\/api\/payments\/[a-z0-9]+\/notify$/;

export function middleware(request: NextRequest): NextResponse {
  const www = wwwToApex(request);
  if (www) return www;

  const gate = previewGate(request);
  if (gate) return withSecurityHeaders(request, gate);

  const english = englishPrefix(request);
  if (english) return withSecurityHeaders(request, english);

  return withSecurityHeaders(request, null);
}

/**
 * One address per page. `www.yavaya.lat` answers too, but it is the same
 * site: a permanent redirect makes search engines count one page, not two.
 */
function wwwToApex(request: NextRequest): NextResponse | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  if (!host.toLowerCase().startsWith('www.')) return null;
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${host.slice(4)}`);
  return NextResponse.redirect(target, 308);
}

/**
 * Private preview gate.
 *
 * Active only when `PREVIEW_ACCESS_KEY` is set. It exists so the team can use
 * the real deployment before Yavaya is ready for the public — while email
 * delivery is unconfigured, a stranger who registers would be stranded with no
 * verification code.
 *
 * This is a curtain, not a security boundary. It keeps the unfinished product
 * away from the public and search engines; it is not what protects member
 * data. That is the session and permission system, which applies underneath it
 * exactly as it will in production.
 *
 * Returns a response when the request should be intercepted, or null to let it
 * proceed.
 */
function previewGate(request: NextRequest): NextResponse | null {
  const expected = process.env.PREVIEW_ACCESS_KEY;
  if (!expected) return null;

  const { pathname, searchParams } = request.nextUrl;
  if (PREVIEW_EXEMPT.includes(pathname) || PREVIEW_EXEMPT_PATTERN.test(pathname)) return null;

  // Arriving with the key in the URL: store it and strip it from the address
  // bar, so the key does not sit in history, logs or a shared screenshot.
  const supplied = searchParams.get(PREVIEW_PARAM);
  if (supplied && constantTimeEquals(supplied, expected)) {
    const secure = isSecureRequest(request);
    const destination = request.nextUrl.clone();
    destination.searchParams.delete(PREVIEW_PARAM);

    // Behind a proxy the internal request is plaintext and addressed to the
    // machine, not the domain. Redirecting to that verbatim would bounce the
    // visitor through http and possibly at an internal hostname, so the
    // scheme and host the client actually used are restored from the
    // forwarded headers.
    if (secure) destination.protocol = 'https:';

    const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (forwardedHost) {
      // Assigning `host` alone would keep the internal port, producing
      // `https://yavaya.example:3000/`. Hostname and port are set separately so
      // a forwarded host without a port clears it.
      const [hostname, port] = forwardedHost.split(':');
      if (hostname) destination.hostname = hostname;
      destination.port = port ?? '';
    }

    const response = NextResponse.redirect(destination);
    response.cookies.set(PREVIEW_COOKIE, expected, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  const cookie = request.cookies.get(PREVIEW_COOKIE)?.value;
  if (cookie && constantTimeEquals(cookie, expected)) return null;

  // 404 rather than 401: a preview that announces itself invites attention.
  return new NextResponse(null, { status: 404 });
}

/**
 * `/en/...` addresses.
 *
 * The website used to serve English under /en/. Pages now have one address
 * each and the language is a preference, so an /en/ link chooses English and
 * lands on the page it named. Links shared from the old site keep working.
 */
function englishPrefix(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname !== '/en' && !pathname.startsWith('/en/')) return null;

  const destination = request.nextUrl.clone();
  destination.pathname = pathname.slice(3).replace(/\/$/, '') || '/';
  applyForwardedOrigin(request, destination);

  const response = NextResponse.redirect(destination);
  response.cookies.set('yav_locale', 'en', {
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

/**
 * Behind the platform's proxy the request URL carries the internal host, so a
 * redirect built from it would send the browser to an address it cannot
 * reach. Rebuild the origin from the forwarded headers.
 */
function applyForwardedOrigin(request: NextRequest, destination: URL): void {
  if (isSecureRequest(request)) destination.protocol = 'https:';
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (forwardedHost) {
    const [hostname, port] = forwardedHost.split(':');
    if (hostname) destination.hostname = hostname;
    destination.port = port ?? '';
  }
}

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * The nonce is passed to the renderer through a request header; Next.js stamps
 * it onto the scripts it emits. The result is a policy with no `unsafe-inline`
 * for scripts, so an injected `<script>` will not execute even if one ever
 * reaches the page.
 *
 * `style-src` still allows inline styles. React writes inline `style`
 * attributes for the district accent tokens and there is no nonce mechanism
 * for those. Style injection is a far smaller hazard than script injection,
 * and the alternative would be abandoning per-district theming.
 *
 * `unsafe-eval` is permitted in development only, because the dev bundler
 * needs it. Never in production.
 */
function withSecurityHeaders(request: NextRequest, existing: NextResponse | null): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const isDevelopment = process.env.NODE_ENV === 'development';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    // Nothing third-party is contacted from the browser. Widening this is a
    // deliberate decision, not a convenience.
    `connect-src 'self'`,
    // The map library draws in a worker it creates from a blob. Tiles still
    // come only from this origin (see /api/map).
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // A purchase form posts here and is redirected to the payment provider's
    // hosted checkout; browsers apply form-action to that redirect too.
    `form-action 'self' https://checkout.dlocalgo.com https://checkout-sbx.dlocalgo.com https://www.paypal.com https://www.sandbox.paypal.com https://checkout.stripe.com`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  if (existing) {
    existing.headers.set('content-security-policy', csp);
    return existing;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // The path, for the canonical tag the root layout renders.
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);

  // While the preview gate is up, keep the unfinished product out of indexes.
  if (process.env.PREVIEW_ACCESS_KEY) {
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  return response;
}

/**
 * Whether the client's own connection is HTTPS.
 *
 * Fly, and every other platform that terminates TLS at the edge, forwards
 * plaintext to the application — so `nextUrl.protocol` is `http` even for a
 * visitor on HTTPS. Trusting it would leave the preview cookie without the
 * `secure` flag in production.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return request.nextUrl.protocol === 'https:';
}

/**
 * Compares two strings without leaking their difference through timing.
 *
 * `node:crypto.timingSafeEqual` is unavailable in the edge runtime, so this
 * compares every character regardless of where the first mismatch occurs.
 * Length is compared separately and does leak — acceptable here, since the key
 * length is not the secret.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the image optimiser, which are served
     * without a document context and need no policy.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|maplibre/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
