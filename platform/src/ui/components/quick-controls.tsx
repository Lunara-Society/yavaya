import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { LanguagePreference, ThemePreference } from '@/server/preferences';
import { setLanguageAction, setThemeAction, signOutAction } from '@/app/settings/actions';
import { SegmentedControl } from './segmented-control';

/**
 * The global controls panel.
 *
 * Everything a member reaches for constantly — language, appearance, their
 * shortcuts, and signing in or out — in one place, one tap from anywhere.
 *
 * Built on `<details>`: it opens and closes natively, is announced correctly by
 * screen readers, and needs no JavaScript. The panel is anchored to the right
 * edge and sized for a thumb.
 */
export function QuickControls({
  t,
  language,
  theme,
  member,
}: {
  t: Translator;
  language: LanguagePreference;
  theme: ThemePreference;
  member: { yayId: string; displayName: string } | null;
}) {
  return (
    <details className="group relative">
      <summary
        className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
        aria-label={t('controls.open')}
      >
        <SlidersGlyph />
        <span className="hidden sm:inline">{t('controls.title')}</span>
        <ChevronGlyph />
      </summary>

      <div
        className="surface-card absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] p-4 shadow-lg"
        role="group"
        aria-label={t('controls.title')}
      >
        <section>
          <h2 className="text-2xs font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
            {t('common.language')}
          </h2>
          <div className="mt-2">
            <SegmentedControl
              action={setLanguageAction}
              name="language"
              legend={t('common.language')}
              current={language}
              options={[
                { value: 'auto', label: t('common.language.auto'), hint: t('common.language.auto_hint') },
                { value: 'es', label: t('common.language.es') },
                { value: 'en', label: t('common.language.en') },
              ]}
            />
          </div>
          {language === 'auto' ? (
            <p className="mt-1.5 text-2xs text-[var(--text-muted)]">
              {t('common.language.auto_hint')}
            </p>
          ) : null}
        </section>

        <section className="mt-4">
          <h2 className="text-2xs font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
            {t('common.theme')}
          </h2>
          <div className="mt-2">
            <SegmentedControl
              action={setThemeAction}
              name="theme"
              legend={t('common.theme')}
              current={theme}
              options={[
                { value: 'system', label: t('common.theme.system'), hint: t('common.theme.system_hint') },
                { value: 'light', label: t('common.theme.light') },
                { value: 'dark', label: t('common.theme.dark') },
              ]}
            />
          </div>
        </section>

        <section className="mt-4">
          <h2 className="text-2xs font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
            {t('controls.shortcuts')}
          </h2>
          <ul className="mt-2 space-y-0.5">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.href}>
                <Link
                  href={shortcut.href}
                  className="flex min-h-touch items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-[var(--surface-sunken)]"
                >
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    {shortcut.glyph}
                  </span>
                  {t(shortcut.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 border-t pt-4">
          {member ? (
            <div>
              <p className="font-mono text-2xs tracking-wider text-[var(--text-muted)]">
                {member.yayId}
              </p>
              <p className="mt-0.5 truncate font-medium">{member.displayName}</p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/account"
                  className="flex min-h-touch flex-1 items-center justify-center rounded-xl px-3 text-sm font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
                >
                  {t('nav.member_area')}
                </Link>
                <form action={signOutAction} className="flex-1">
                  <button
                    type="submit"
                    className="min-h-touch w-full rounded-xl border px-3 text-sm font-medium"
                  >
                    {t('auth.sign_out')}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--text-secondary)]">{t('auth.member_prompt')}</p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/register"
                  className="flex min-h-touch flex-1 items-center justify-center rounded-xl px-3 text-sm font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
                >
                  {t('auth.submit_register')}
                </Link>
                <Link
                  href="/login"
                  className="flex min-h-touch flex-1 items-center justify-center rounded-xl border px-3 text-sm font-medium"
                >
                  {t('auth.submit_login')}
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </details>
  );
}

/**
 * Shortcuts.
 *
 * Deliberately few. These are the destinations a member returns to, not a
 * sitemap — a long list here would defeat the point of a shortcut.
 */
const SHORTCUTS: Array<{ href: string; labelKey: MessageKey; glyph: string }> = [
  { href: '/account', labelKey: 'nav.member_area', glyph: '◈' },
  { href: '/account/tokens', labelKey: 'nav.tokens', glyph: '◆' },
  { href: '/settings#notifications', labelKey: 'nav.notifications', glyph: '◔' },
  { href: '/settings#location', labelKey: 'nav.location', glyph: '◎' },
  { href: '/settings#security', labelKey: 'nav.security', glyph: '⛨' },
  { href: '/status', labelKey: 'nav.status', glyph: '◈' },
];

function SlidersGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="10" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
