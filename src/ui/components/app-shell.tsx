import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';

/**
 * The Yavaya shell.
 *
 * Mobile is the primary experience, so navigation lives at the bottom within
 * thumb reach and the header stays minimal. The same shell wraps every
 * district — a district changes the content and the accent, never the way
 * someone moves around Yavaya.
 */
export function AppShell({
  t,
  district,
  children,
}: {
  t: Translator;
  /** Applies the district's colour world to everything inside. */
  district?: string;
  children: ReactNode;
}) {
  return (
    <div data-district={district} className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('nav.skip_to_content')}
      </a>

      <header className="sticky top-0 z-20 border-b bg-[var(--surface-base)]/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <YavayaMark />
            <span className="text-lg">{t('brand.name')}</span>
          </Link>
          <Link
            href="/status"
            className="rounded-full border px-3 py-1.5 text-2xs font-medium tracking-wide text-[var(--text-secondary)] uppercase"
          >
            {t('nav.status')}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28">
        {children}
      </main>

      <BottomNav t={t} />
    </div>
  );
}

/**
 * Bottom navigation.
 *
 * Four destinations, each a full touch target, labelled in words as well as
 * shape — an icon alone is guesswork for a first-time user.
 */
function BottomNav({ t }: { t: Translator }) {
  const items = [
    { href: '/', labelKey: 'nav.home' as const, glyph: <HomeGlyph /> },
    { href: '/districts', labelKey: 'nav.districts' as const, glyph: <GridGlyph /> },
    { href: '/status', labelKey: 'nav.status' as const, glyph: <PulseGlyph /> },
    { href: '/login', labelKey: 'nav.account' as const, glyph: <PersonGlyph /> },
  ];

  return (
    <nav
      aria-label={t('nav.home')}
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-[var(--surface-raised)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-4">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-touch flex-col items-center justify-center gap-1 py-2 text-2xs font-medium text-[var(--text-secondary)]"
            >
              <span aria-hidden="true">{item.glyph}</span>
              {t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The Yavaya mark: converging paths meeting at one point — one identity. */
function YavayaMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" role="img" aria-hidden="true" fill="none">
      <path
        d="M4 4.5 12 13v6.5M20 4.5 12 13"
        stroke="var(--accent)"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

function HomeGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PulseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h4l2.5-6 4 12L16 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
