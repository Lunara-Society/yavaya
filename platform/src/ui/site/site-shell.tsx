import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import type { LanguagePreference, ThemePreference } from '@/server/preferences';
import { QuickControls } from '@/ui/components/quick-controls';
import { Alive } from './alive';
import { DISTRICT_IDS, PAGE_PATHS, type PageId } from './blocks';
import { Icon, Mark, TokenCoin } from './icons';
import { Md } from './md';
import { LocationBar } from './location-bar';
import { LiveTicker } from './live-ticker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { db } from '@/server/db/client';
import { placeCountries } from '@/server/domains/geography/places';
import { chosenPlace, PLACE_COOKIE } from '@/server/place-choice';
import { resolveLocale } from '@/server/preferences';
import { LIVE_FEED_RULES, PLACE_RULES } from '@/config/business-rules';

/**
 * `unread` is the count of unread notifications, shown on the bell;
 * `tokens` is the member's balance, shown on the token chip.
 */
export type ShellMember = { yayId: string; displayName: string; unread?: number; tokens?: number } | null;

/**
 * The frame around every page: public pages and the member area alike, so
 * Yavaya looks like one place whether or not someone is signed in.
 *
 * Sign-in and account links come from the real session. The ribbon says
 * plainly what is open and what is not; it is content, not decoration.
 */
export async function SiteShell({
  c,
  t,
  language,
  theme,
  member,
  current,
  district,
  tone,
  children,
}: {
  c: SiteContent;
  t: Translator;
  language: LanguagePreference;
  theme: ThemePreference;
  member: ShellMember;
  current?: PageId;
  /** Applies the platform's district colour world to what is inside. */
  district?: string;
  /** A website district page's colour (tone-*), applied to the body only. */
  tone?: string;
  children: ReactNode;
}) {
  const cur = (id: PageId) => (id === current ? ('page' as const) : undefined);
  const locale = await resolveLocale();
  // The location bar is a convenience: if places cannot be read, the page still renders without a choice.
  const [place, countries] = await Promise.all([
    chosenPlace(locale).catch(() => null),
    placeCountries(db(), locale).catch(() => []),
  ]);
  const primary: PageId[] = ['districts', 'trust', 'reputation', 'tokens', 'status'];
  const groups: Array<[string, PageId[]]> = [
    [c.ui.menu.districts, ['districts', ...DISTRICT_IDS]],
    [c.ui.menu.platform, ['trust', 'reputation', 'tokens', 'pricing', 'transparency']],
    [c.ui.menu.yavaya, ['about', 'roadmap', 'status', 'help', 'privacy', 'terms']],
  ];

  return (
    <div className="site" data-district={district}>
      <Alive />
      {/* The soft light that follows a mouse across the dark; moved by Alive, styled in site.css. */}
      <div className="cine-spot" aria-hidden="true" />
      <a className="skip" href="#main">
        {c.ui.skip}
      </a>
      <header className="top">
        <div className="wrap top-in">
          <Link className="brand" href="/" aria-label={`${c.ui.brand} — ${c.nav.home}`}>
            <Mark />
            <span>YAVAYA</span>
          </Link>
          <nav className="nav" aria-label={c.ui.navLabel}>
            {primary.map((id) => (
              <Link key={id} href={PAGE_PATHS[id]} aria-current={cur(id)}>
                {c.nav[id]}
              </Link>
            ))}
          </nav>
          <div className="tools">
            <LocationBar
              labels={{
                label: t('place.bar.label'),
                everywhere: t('place.bar.everywhere'),
                title: t('place.bar.title'),
                intro: t('place.bar.intro'),
                useLocation: t('place.bar.use_location'),
                locating: t('place.bar.locating'),
                locationFailed: t('place.bar.location_failed'),
                countries: t('place.bar.countries'),
                close: t('place.bar.close'),
                privacy: t('place.bar.privacy'),
                picker: placePickerLabels(t),
              }}
              initial={place ? { code: place.code, name: place.name, context: place.context } : null}
              countries={countries.map((country) => ({ code: country.code, name: country.name }))}
              cookieName={PLACE_COOKIE}
              maxAgeSeconds={PLACE_RULES.choiceCookieSeconds}
            />
            {member ? (
              <>
                {/* The fastest way to tokens: the balance, always in sight, one tap from the packages. */}
                <Link className="chip tk-chip" href="/account/tokens#paquetes" aria-label={t('tokens.chip_label', { count: member.tokens ?? 0 })}>
                  <TokenCoin className="tk-coin" />
                  <span className="tk-chip-n">{member.tokens ?? 0}</span>
                </Link>
                <Link
                  className="chip bell"
                  href="/notifications"
                  aria-label={member.unread ? t('notifications.bell_unread', { count: member.unread }) : t('notifications.title')}
                >
                  <Icon name="bell" />
                  {member.unread ? <span className="bell-count">{member.unread > 99 ? '99+' : member.unread}</span> : null}
                </Link>
                <Link className="chip member-chip" href="/account">
                  {member.displayName || member.yayId}
                </Link>
              </>
            ) : (
              <>
                <Link className="chip member-chip" href="/login">
                  {t('nav.sign_in')}
                </Link>
                <Link className="btn btn-gold" href="/register" style={{ minHeight: 44 }}>
                  {t('auth.submit_register')}
                </Link>
              </>
            )}
            <QuickControls t={t} language={language} theme={theme} member={member} />
            <details className="menu">
              <summary className="chip" aria-label={c.ui.menuOpen}>
                <Icon name="menu" />
              </summary>
              <div className="menu-panel">
                {groups.map(([label, ids], g) => (
                  <div key={label}>
                    {g > 0 ? <hr /> : null}
                    <div className="menu-label">{label}</div>
                    {ids.map((id) => (
                      <Link key={id} href={PAGE_PATHS[id]} aria-current={cur(id)}>
                        {c.nav[id]}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="ribbon" role="note">
        <div className="wrap">
          <strong>{c.ui.ribbon.label}</strong>
          <span>
            <Md text={c.ui.ribbon.text} />
          </span>
          <Link href={PAGE_PATHS.status}>{c.ui.ribbon.link}</Link>
        </div>
      </div>

      <main id="main" className={tone ? `tone-${tone}` : undefined}>
        {children}
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <Link className="brand" href="/">
                <Mark />
                <span>YAVAYA</span>
              </Link>
              <p className="muted mt">{c.ui.footer.about}</p>
              <p>
                <a href={c.ui.footer.whatsappHref} rel="noopener">
                  {c.ui.footer.contact} · {c.ui.footer.whatsappLabel}
                </a>
              </p>
            </div>
            {groups.map(([label, ids]) => (
              <div key={label}>
                <h4>{label}</h4>
                <ul>
                  {ids.map((id) => (
                    <li key={id}>
                      <Link href={PAGE_PATHS[id]}>{c.nav[id]}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="foot-base">
            <span>{c.ui.footer.copy}</span>
            <span>{c.ui.footer.honest}</span>
          </div>
          <p className="foot-note">{c.ui.footer.imagery}</p>
          <p className="foot-note">{t('place.attribution')}</p>
        </div>
      </footer>

      <LiveTicker
        place={place?.code ?? null}
        rules={LIVE_FEED_RULES}
        labels={{
          label: t('live.label'),
          region: t('live.region'),
          snooze: t('live.snooze'),
          resume: t('live.resume'),
          close: t('live.close'),
          nearby: t('live.nearby'),
          agoNow: t('live.ago_now'),
          agoMinutes: t('live.ago_minutes', { count: '{count}' }),
          agoHours: t('live.ago_hours', { count: '{count}' }),
        }}
      />

      <nav className="dock" aria-label={c.ui.dockLabel}>
        <Link href="/" aria-current={cur('home')}>
          <Icon name="home" />
          <span>{c.nav.home}</span>
        </Link>
        <Link href={PAGE_PATHS.districts} aria-current={cur('districts')}>
          <Icon name="grid" />
          <span>{c.nav.districts}</span>
        </Link>
        {/* Tokens sit in the middle of the bar, raised, where a thumb lands first. */}
        <Link className="dock-tokens" href={member ? '/account/tokens#paquetes' : PAGE_PATHS.tokens} aria-current={cur('tokens')}>
          <span className="dock-orb">
            <TokenCoin className="tk-coin" />
          </span>
          <span>{c.nav.tokens}</span>
        </Link>
        <Link href={PAGE_PATHS.trust} aria-current={cur('trust')}>
          <Icon name="shield" />
          <span>{c.nav.trust}</span>
        </Link>
        <Link href={member ? '/account' : '/login'}>
          <Icon name="id" />
          <span>{member ? t('nav.member_area') : t('nav.sign_in')}</span>
        </Link>
      </nav>
    </div>
  );
}
