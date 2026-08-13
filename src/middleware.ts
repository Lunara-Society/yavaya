import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy.
 *
 * A per-request nonce is generated here and passed to the renderer through a
 * request header; Next.js picks it up and stamps it on the scripts it emits.
 * The result is a policy with no `unsafe-inline` for scripts — so an injected
 * `<script>` will not execute even if one ever reaches the page.
 *
 * `style-src` still allows inline styles. React writes inline `style`
 * attributes for the district accent tokens, and there is no nonce mechanism
 * for those. Style injection is a far smaller hazard than script injection,
 * and the alternative would be to abandon per-district theming.
 *
 * In development `unsafe-eval` is permitted because the dev bundler needs it.
 * It is never permitted in production.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDevelopment = process.env.NODE_ENV === 'development';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    // No third-party endpoints are contacted from the browser. Widening this
    // is a deliberate decision, not a convenience.
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the image optimiser, which are served
     * without a document context and do not need a policy.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
