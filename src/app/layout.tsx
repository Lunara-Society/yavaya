import type { Metadata, Viewport } from 'next';
import { resolveLocale } from '@/i18n/server';
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
  const locale = await resolveLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
