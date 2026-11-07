import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { resolveLocale, resolveThemeAttribute } from '@/server/preferences';
import { themeAttributeAt } from '@/config/preferences';
import { ThemeKeeper } from '@/ui/site/theme-keeper';
import { RoxiRoot } from '@/ui/roxi/roxi-root';
import { FormCheck, type FormCheckLabels } from '@/ui/site/form-check';
import { ClientErrors } from '@/ui/components/client-errors';
import { createTranslator } from '@/i18n';
import { db } from '@/server/db/client';
import { lookEnabled } from '@/server/domains/platform/looks';
import { ERROR_TEXTS_ID, errorTexts } from '@/i18n/error-texts';
import './globals.css';

/**
 * Site-wide metadata. Read per request (not at build), because the Google
 * Search Console verification code is an environment variable the owner
 * sets on the host: GOOGLE_SITE_VERIFICATION.
 *
 * The share card and the icons live in /public, in two sets: the owner's new
 * logo and the seal before it, chosen by the "logo" look switch. Pages set their own
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
  const [pathname, locale, newLogo] = await Promise.all([(async () => (await headers()).get('x-pathname') ?? '/')(), resolveLocale(), lookEnabled(db(), 'logo')]);
  // The owner's new logo while its switch is on (Admin → Diseño del sitio); the seal's files otherwise, untouched.
  const brand = newLogo
    ? { favicon: '/logo-favicon.ico', icon: '/logo-icon-192.png', apple: '/logo-apple-touch-icon.png', card: '/og-logo.jpg' }
    : { favicon: '/favicon.ico', icon: '/icon-192.png', apple: '/apple-touch-icon.png', card: '/og.jpg' };
  const canonical = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  // The default title and description speak the visitor's language, like the page under them.
  const t = createTranslator(locale);
  return {
    metadataBase: new URL(process.env.APP_URL ?? 'https://yavaya.lat'),
    title: {
      default: t('meta.title'),
      template: '%s · Yavaya',
    },
    description: t('meta.description'),
    icons: {
      icon: [
        { url: brand.favicon, sizes: '48x48' },
        { url: brand.icon, sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: brand.apple, sizes: '180x180' }],
    },
    manifest: '/manifest.webmanifest',
    alternates: { canonical },
    applicationName: 'Yavaya',
    formatDetection: { telephone: false },
    openGraph: {
      type: 'website',
      siteName: 'Yavaya',
      locale: locale === 'en' ? 'en_US' : 'es_LA',
      alternateLocale: [locale === 'en' ? 'es_LA' : 'en_US'],
      images: [{ url: brand.card, width: 1200, height: 630, alt: t('meta.title') }],
    },
    twitter: { card: 'summary_large_image', images: [brand.card] },
    ...(verification ? { verification: { google: verification } } : {}),
  };
}

/*
 * Phones get a phone layout. Until 20 October 2026 every visitor was served
 * the desktop page at a fixed 1200px, which a phone shrank to a third of its
 * size — body text near five pixels. The owner reversed that once it was seen
 * on a real phone. The stylesheets are mobile-first (min-width queries), so
 * device-width is all it takes. Zoom stays enabled.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#071b22',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme, requestHeaders] = await Promise.all([resolveLocale(), resolveThemeAttribute(), headers()]);
  const themeHere = themeAttributeAt(requestHeaders.get('x-pathname'), theme);

  /*
   * The theme is resolved on the server before the first byte, so the correct
   * palette is in the very first paint — no flash of the wrong theme, and no
   * render-blocking inline script to prevent one.
   *
   * `theme` is null when the member follows their device, in which case no
   * attribute is set and the stylesheet's `prefers-color-scheme` rules apply.
   */
  // `<` is escaped so the text can never close the element.
  const t = createTranslator(locale);
  const errorJson = JSON.stringify(errorTexts(t)).replace(/</g, '\\u003c');
  const formCheck: FormCheckLabels = {
    summaryOne: t('form.check.summary_one'),
    summaryMany: t('form.check.summary_many', { count: '{count}' }),
    required: t('form.check.required'),
    choose: t('form.check.choose'),
    file: t('form.check.file'),
    checkbox: t('form.check.checkbox'),
    email: t('form.check.email'),
    tooShort: t('form.check.too_short', { min: '{min}' }),
    tooLong: t('form.check.too_long', { max: '{max}' }),
    tooLow: t('form.check.too_low', { min: '{min}' }),
    tooHigh: t('form.check.too_high', { max: '{max}' }),
    number: t('form.check.number'),
    format: t('form.check.format'),
  };
  // The word in the corner of illustrative photographs (ArtNote in src/ui/site/art.tsx), read by site.css.
  const artNote = { ['--art-note' as string]: JSON.stringify(t('art.note')) } as React.CSSProperties;
  return (
    <html lang={locale} data-theme={themeHere ?? undefined} style={artNote}>
      <body>
        {/* The error page's words, so the boundary needs no dictionary (src/i18n/error-texts.ts). Data, never run. */}
        <script id={ERROR_TEXTS_ID} type="application/json" dangerouslySetInnerHTML={{ __html: errorJson }} />
        {/* Santuario is candlelit whatever the member chose (config/preferences.ts); this keeps that true across navigation. */}
        <ThemeKeeper chosen={theme} />
        {/* Every form that will not send says why, field by field (src/ui/site/form-check.tsx). */}
        <FormCheck labels={formCheck} />
        {/* Errors in this browser reach the team, through Yavaya's own server (src/ui/components/client-errors.tsx). */}
        <ClientErrors />
        {children}
        {/* Roxi, the assistant: here rather than in a page so a conversation survives navigation. */}
        <RoxiRoot />
      </body>
    </html>
  );
}
