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
  // The microphone for this site only: speaking to Roxi. The browser still asks the member first.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), payment=(), geolocation=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/*
 * Addresses from the earlier static website. Pages there had Spanish slugs
 * (and flat .html files before that); every page now has one English-slug
 * address and the language is a preference. Old links land on the same page.
 */
const LEGACY_PATHS: Record<string, string> = {
  distritos: '/districts',
  comunidad: '/community',
  impacto: '/impact',
  animales: '/animals',
  confianza: '/trust',
  reputacion: '/reputation',
  precios: '/pricing',
  transparencia: '/transparency',
  estado: '/status',
  'hoja-de-ruta': '/roadmap',
  nosotros: '/about',
  ayuda: '/help',
  privacidad: '/privacy',
  // Spanish names of the districts and pages people type or guess (the site is
  // in Spanish; its addresses are in English), and common guesses in English.
  servicios: '/services',
  trabajo: '/work',
  empleos: '/work',
  santuario: '/sanctuary',
  terminos: '/terms',
  'acerca-de': '/about',
  ajustes: '/settings',
  configuracion: '/settings',
  cuenta: '/account',
  notificaciones: '/notifications',
  entrar: '/login',
  'iniciar-sesion': '/login',
  registro: '/register',
  'crear-cuenta': '/register',
  'forgot-password': '/login/olvide',
  'olvide-mi-contrasena': '/login/olvide',
  'recuperar-contrasena': '/login/olvide',
  'reset-password': '/login/olvide',
  signup: '/register',
  'sign-up': '/register',
  signin: '/login',
  'sign-in': '/login',
  'work/new': '/work/posts/new',
  'trabajo/nuevo': '/work/posts/new',
  'services/request': '/services/new',
  'mercadito/new': '/mercadito/publish',
  'mercadito/nuevo': '/mercadito/publish',
  'mercadito/vender': '/mercadito/publish',
  'community/post': '/community/new',
  // The guide's address is Spanish (/guia); the English guess found nothing (report of 7 November 2026).
  guide: '/guia',
  'roxi/conexiones': '/roxi/connections',
  'roxi/memoria': '/roxi/memory',
  'index.html': '/',
  'mercadito.html': '/mercadito',
  'yavayago.html': '/yavayago',
  'work.html': '/work',
  'church.html': '/community',
  'animals.html': '/animals',
  'ayuda.html': '/help',
  'tokens.html': '/tokens',
  'admin.html': '/',
};

/*
 * Rides and errands live at /yavayago/viajes and the live map at
 * /yavayago/mapa; an English "rides" link (a tester followed one) found
 * nothing. The store list is a section of /yavayago itself.
 */
const GO_ALIASES: Record<string, string> = {
  rides: '/yavayago/viajes',
  ride: '/yavayago/viajes',
  trips: '/yavayago/viajes',
  errands: '/yavayago/viajes',
  mandados: '/yavayago/viajes',
  map: '/yavayago/mapa',
  'live-map': '/yavayago/mapa',
  live: '/yavayago/mapa',
  stores: '/yavayago#stores',
};

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
  // Roxi's welcome voice notes are read from disk by their one route, which
  // serves them only to their recipient; they are not in public/ on purpose.
  outputFileTracingIncludes: { '/api/roxi/welcome/audio': ['./src/server/assets/roxi-welcome/*.mp3'] },
  experimental: {
    // Server Actions are the primary mutation surface; keep the body limit tight
    // so upload paths must go through the dedicated, validated media pipeline.
    serverActions: { bodySizeLimit: '1mb' },
    // Server code only, never what browsers download: unminified, an error
    // report's stack names the real function and file (src/instrumentation.ts)
    // instead of `e (page.js:1:701)`, without uploading source maps anywhere.
    serverMinification: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Remote image hosts are a configuration point — see docs/CONFIGURATION.md.
    remotePatterns: [],
  },
  async redirects() {
    return [
      ...Object.entries(LEGACY_PATHS).map(([from, to]) => ({
        source: `/${from}{/}?`,
        destination: to,
        permanent: true,
      })),
      // Addresses people guess for YavayaGo's pages, in either language. Each
      // lands on the one real page, never a 404 or a second copy of it.
      ...Object.entries(GO_ALIASES).map(([from, to]) => ({
        source: `/yavayago/${from}{/}?`,
        destination: to,
        permanent: true,
      })),
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Files in /public keep their names when they are replaced (the art was
      // swapped for the guide's stills under the same names), so a day, not a
      // year — but not zero either: on a slow connection, re-checking every
      // photo and font on every page is time a phone does not have.
      ...['art', 'brand', 'fonts', 'tokens', 'guide', 'share', 'first-light'].map((folder) => ({
        source: `/${folder}/:path*`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      })),
      // The First Light preview is not to be indexed. Its robots meta tag can be
      // streamed after <head> for ordinary browsers, so the header says it too.
      { source: '/first-light', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default nextConfig;
