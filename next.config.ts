import type { NextConfig } from 'next';

/**
 * Security headers are applied globally. Anything that needs to be relaxed for a
 * specific route must be relaxed explicitly at that route, never here.
 */
/*
 * The Content-Security-Policy is not here: it needs a per-request nonce and is
 * set in src/middleware.ts. Everything below is static and applies to every
 * response.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), geolocation=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * `standalone` emits a self-contained server bundle, which is what the
   * container image copies — small image, no build toolchain at runtime.
   *
   * It is off on Vercel, which builds Next natively and has its own output
   * format. Yavaya stays deployable both ways: a container anywhere, or a
   * serverless platform, without a second configuration to maintain.
   */
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  experimental: {
    // Server Actions are the primary mutation surface; keep the body limit tight
    // so upload paths must go through the dedicated, validated media pipeline.
    serverActions: { bodySizeLimit: '1mb' },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Remote image hosts are a configuration point — see docs/CONFIGURATION.md.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
