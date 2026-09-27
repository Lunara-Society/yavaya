import type { Metadata, Viewport } from 'next';
import { resolveLocale, resolveThemeAttribute } from '@/server/preferences';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://yavaya.lat'),
  title: {
    default: 'Yavaya — El hogar digital de Centroamérica',
    template: '%s · Yavaya',
  },
  description:
    'Yavaya: el hogar digital de Centroamérica. Compra, vende, trabaja, pide, ayuda y pertenece — con una sola cuenta y una sola reputación.',
  icons: { icon: '/favicon.svg' },
  applicationName: 'Yavaya',
  formatDetection: { telephone: false },
};

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
