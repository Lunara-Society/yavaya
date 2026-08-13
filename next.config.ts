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
   * Emits a self-contained server bundle with only the dependencies actually
   * used, which is what the container image copies. Keeps the image small and
   * means the runtime stage carries no build toolchain.
   */
  output: 'standalone',
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
