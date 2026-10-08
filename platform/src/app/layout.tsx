import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { resolveLocale, resolveThemeAttribute } from '@/server/preferences';
import './globals.css';

/**
 * Site-wide metadata. Read per request (not at build), because the Google
 * Search Console verification code is an environment variable the owner
 * sets on the host: GOOGLE_SITE_VERIFICATION.
 *
 * The share card (og.jpg) and the icons live in /public. Pages set their own
 * title and description; Open Graph has no title here on purpose, so sharing
 * a page shows that page's own title rather than the site's.
 */
export async function generateMetadata(): Promise<Metadata> {
  const verification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  /*
   * One address per page: the path without its query string, so filters and
   * sort orders (`?category=…`) count as the page they filter. Rendered as a
   * tag, not a header: the host's edge merges duplicate Link headers.
   */
  const pathname = (await headers()).get('x-pathname') ?? '/';
  const canonical = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  return {
    metadataBase: new URL(process.env.APP_URL ?? 'https://yavaya.lat'),
    title: {
      default: 'Yavaya — El hogar digital de Centroamérica',
      template: '%s · Yavaya',
    },
    description:
      'Yavaya: el hogar digital de Centroamérica. Compra, vende, trabaja, pide, ayuda y pertenece — con una sola cuenta y una sola reputación.',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
    manifest: '/manifest.webmanifest',
    alternates: { canonical },
    applicationName: 'Yavaya',
    formatDetection: { telephone: false },
    openGraph: {
      type: 'website',
      siteName: 'Yavaya',
      locale: 'es_LA',
      alternateLocale: ['en_US'],
      images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Yavaya — El hogar digital de Centroamérica' }],
    },
    twitter: { card: 'summary_large_image', images: ['/og.jpg'] },
    ...(verification ? { verification: { google: verification } } : {}),
  };
}

/*
 * Every visitor gets the desktop layout, phones included: the owner's
 * decision. A fixed layout width makes a phone render the full desktop page
 * scaled to fit. Zoom stays enabled — pinch-to-zoom is how small text is read.
 * To return to a phone layout, use width 'device-width' with initialScale 1;
 * the stylesheets still carry the mobile rules.
 */
export const viewport: Viewport = {
  width: '1200',
  themeColor: '#081120',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme] = await Promise.all([resolveLocale(), resolveThemeAttribute()]);

  /*
   * The theme is resolved on the server before the first byte, so the correct
   * palette is in the very first paint — no flash of the wrong theme, and no
   * render-blocking inline script to prevent one.
   *
   * `theme` is null when the member follows their device, in which case no
   * attribute is set and the stylesheet's `prefers-color-scheme` rules apply.
   */
  return (
    <html lang={locale} data-theme={theme ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
