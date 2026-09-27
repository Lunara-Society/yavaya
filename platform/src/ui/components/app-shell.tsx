import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MessageKey, Translator } from '@/i18n';
import type { LanguagePreference, ThemePreference } from '@/server/preferences';
import { QuickControls } from './quick-controls';

export type ShellMember = { yayId: string; displayName: string } | null;

/**
 * The Yavaya shell.
 *
 * Mobile is the primary experience, so navigation sits at the bottom within
 * thumb reach and the header carries only the mark and the global controls.
 * The same shell wraps every district — a district changes the content and the
 * accent, never the way someone moves around Yavaya.
 */
export function AppShell({
  t,
  language,
  theme,
  member,
  district,
  children,
}: {
  t: Translator;
  language: LanguagePreference;
  theme: ThemePreference;
  member: ShellMember;
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
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <YavayaMark />
            <span className="text-lg">{t('brand.name')}</span>
          </Link>
          <QuickControls t={t} language={language} theme={theme} member={member} />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28">
        {children}
      </main>

      <BottomNav t={t} member={member} />
    </div>
  );
}

/**
 * Bottom navigation.
 *
 * Four destinations, each a full touch target, labelled in words as well as
 * shape — an icon alone is guesswork for a first-time user.
 *
 * The last slot changes with sign-in state: it is the member area for a
 * signed-in member and the sign-in route for everyone else, so the tap always
 * lands somewhere useful.
 */
function BottomNav({ t, member }: { t: Translator; member: ShellMember }) {
  const items: Array<{ href: string; labelKey: MessageKey; glyph: ReactNode }> = [
    { href: '/', labelKey: 'nav.home', glyph: <HomeGlyph /> },
    { href: '/districts', labelKey: 'nav.districts', glyph: <GridGlyph /> },
    { href: '/settings', labelKey: 'nav.settings', glyph: <SlidersGlyph /> },
    member
      ? { href: '/account', labelKey: 'nav.member_area', glyph: <PersonGlyph /> }
      : { href: '/login', labelKey: 'nav.sign_in', glyph: <PersonGlyph /> },
  ];

  return (
    <nav
      aria-label={t('nav.primary')}
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

function SlidersGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.6" />
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
