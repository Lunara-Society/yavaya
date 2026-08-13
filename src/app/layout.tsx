import type { Metadata, Viewport } from 'next';
import { resolveLocale, resolveThemeAttribute } from '@/server/preferences';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Yavaya',
    template: '%s · Yavaya',
  },
  description:
    'Yavaya — one identity, one reputation, multiple districts. Digital infrastructure for Central America.',
  applicationName: 'Yavaya',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never disable zoom: pinch-to-zoom is an accessibility feature, not a
  // layout inconvenience.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#12141a' },
  ],
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
