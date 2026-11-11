import Link from 'next/link';
import { SOCIAL } from '@/config/social';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import type { LanguagePreference, ThemePreference } from '@/server/preferences';
import { QuickControls } from '@/ui/components/quick-controls';
import { Alive } from './alive';
import { DISTRICT_IDS, PAGE_PATHS, type PageId } from './blocks';
import { BOARD_DISTRICTS, BOARD_DISTRICT_KEYS } from '@/config/boards';
import type { MessageKey } from '@/i18n';
import { NightScene } from './art';
import { BrandMark } from './brand-mark';
import { Icon, TokenCoin } from './icons';
import { Md } from './md';
import { LocationBar } from './location-bar';
import { LiveTicker } from './live-ticker';
import { locationBarProps, placeChoice } from './location-props';
import { TopScroll } from './top-scroll';
import { resolveLocale } from '@/server/preferences';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { readSessionCookie } from '@/server/auth/cookies';
import { googleSignIn } from '@/server/domains/identity/google';
import { AuthBar } from './auth-bar';
import { GoogleButton } from '@/ui/components/google-button';
import { GooglePrompt } from '@/ui/components/google-prompt';
import { SiteMetrics } from '@/ui/components/site-metrics';

/**
 * `unread` is the count of unread notifications, shown on the bell;
 * `tokens` is the member's balance, shown on the token chip.
 */
export type ShellMember = {
  yayId: string;
  displayName: string;
  unread?: number;
  tokens?: number;
  /** Holds roles.manage — today only the owner's account, since admin cannot be appointed. Gets the Panel shortcut. */
  owner?: boolean;
} | null;

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
  authBar = true,
  googlePrompt = 'auto',
  home = false,
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
  /** A website district page's colour: its tone (tone-*) on the page, and its whole colour world (worlds.css) on the shell. */
  tone?: string;
  /** The sign-in bar for signed-out visitors; off on the sign-in pages themselves. */
  authBar?: boolean;
  /**
   * Google's sign-in prompt, offered to signed-out visitors on arrival.
   * `after-sign-out` shows it without signing anyone straight back in.
   */
  googlePrompt?: 'auto' | 'after-sign-out' | 'off';
  /**
   * The home page's own header, from the owner's design of 31 October 2026:
   * the sun and its tagline, the place beside them, Explorar · Sobre Yavaya ·
   * Ayuda, and the way in — lying over the hero's photograph (home.css). The
   * ribbon's line moves into the hero, under the search, and the phone's
   * sign-in row gives way to the header's own Entrar unless a session has
   * just ended. Every other page keeps the header below as it is.
   */
  home?: boolean;
  children: ReactNode;
}) {
  const cur = (id: PageId) => (id === current ? ('page' as const) : undefined);
  const locale = await resolveLocale();
  const [{ place }, location] = await Promise.all([placeChoice(locale), locationBarProps(t, locale)]);
  // Signed out with a session cookie still present: the server closed it.
  const ended = !member && Boolean(await readSessionCookie());
  const primary: PageId[] = ['districts', 'trust', 'reputation', 'tokens', 'status'];
  // The design's three links, each to the page it names: Explorar is the districts.
  const homeNav: Array<{ id: PageId; label: string }> = [
    { id: 'districts', label: t('home.nav.explore') },
    { id: 'about', label: t('home.nav.about') },
    { id: 'help', label: c.nav.help },
  ];
  // The six board districts follow the first seven in the districts group; their names come from the dictionary.
  const boardLinks = BOARD_DISTRICT_KEYS.map((key) => ({ href: `/${BOARD_DISTRICTS[key].slug}`, label: t(`district.${key}.name` as MessageKey) }));
  const groups: Array<[string, PageId[]]> = [
    [c.ui.menu.districts, ['districts', ...DISTRICT_IDS]],
    [c.ui.menu.platform, ['trust', 'reputation', 'tokens', 'pricing', 'transparency']],
    [c.ui.menu.yavaya, ['about', 'guide', 'roadmap', 'status', 'help', 'privacy', 'terms']],
  ];

  return (
    // data-tone puts the header, footer and dock in the district's colour world too (worlds.css), not only the page between them.
    <div className="site" data-district={district} data-tone={tone}>
      <Alive />
      {/* Visit counts and real speed, first-party and without identifiers. The owner's own browsing is left out. */}
      {member?.owner ? null : <SiteMetrics />}
      <a className="skip" href="#main">
        {c.ui.skip}
      </a>
      {/* On the home page the header carries its own Entrar; the row stays only to say a session has ended. */}
      {!member && authBar && (!home || ended) ? <AuthBar t={t} google={googleSignIn().available} ended={ended} /> : null}
      {!member && googlePrompt !== 'off' && googleSignIn().available ? <GooglePrompt locale={locale} afterSignOut={googlePrompt === 'after-sign-out'} /> : null}
      {/* A member's header holds more than a visitor's (balance, notices); its phone layout gives way sooner. */}
      <header className={['top', member ? 'is-member' : null, home ? 'is-home' : null].filter(Boolean).join(' ')}>
        {home ? <TopScroll /> : null}
        <div className="wrap top-in">
          <Link className="brand" href="/" aria-label={`${c.ui.brand} — ${c.nav.home}`}>
            <BrandMark home={home} />
            <span>YAVAYA</span>
          </Link>
          {home ? (
            <>
              <span className="top-tagline">
                <span>{t('home.tagline_1')}</span> <span>{t('home.tagline_2')}</span>
              </span>
              {/* The place, beside the name, as the design has it; the hero's search shows the same choice. */}
              <div className="top-place">
                <LocationBar {...location} detail />
              </div>
            </>
          ) : (
            // The ribbon below, as a badge, on wide screens: what is open, one click from the whole answer.
            <Link className="top-stage" href={PAGE_PATHS.status} aria-label={`${c.ui.ribbon.label}. ${c.ui.ribbon.text.replace(/\*/g, '')} ${c.ui.ribbon.link}`}>
              <span className="top-stage-dot" aria-hidden="true" />
              {c.ui.ribbon.label}
            </Link>
          )}
          <nav className="nav" aria-label={c.ui.navLabel}>
            {home
              ? homeNav.map(({ id, label }) => (
                  <Link key={id} href={PAGE_PATHS[id]}>
                    {label}
                  </Link>
                ))
              : primary.map((id) => (
                  <Link key={id} href={PAGE_PATHS[id]} aria-current={cur(id)}>
                    {c.nav[id]}
                  </Link>
                ))}
          </nav>
          <div className="tools">
            {home ? null : <LocationBar {...location} />}
            {member ? (
              <>
                {/* The owner's way into what is happening: the panel, one tap from anywhere. A shortcut, not a permission — /admin checks again. */}
                {member.owner ? (
                  <Link className="chip panel-chip" href="/admin">
                    <Icon name="grid" />
                    <span>{t('nav.panel')}</span>
                  </Link>
                ) : null}
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
            ) : null /* signed out: the row above the header on a phone, the header's own buttons on a wide screen */}
            {/* The design's search button: to the hero's search, which is Mercadito's (home.tsx). */}
            {home ? (
              <a className="chip top-search" href="#buscar" aria-label={t('home.search.label')}>
                <Icon name="search" />
              </a>
            ) : null}
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
                    {g === 0 ? boardLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>) : null}
                  </div>
                ))}
              </div>
            </details>
            {/* Signed out on a wide screen, the way in sits in the header itself; phones keep the row above it. */}
            {!member && authBar ? (
              <span className="top-auth">
                {/* The home page's header is the design's: Entrar and Crear cuenta. Google stays on /login, /register and its own prompt. */}
                {!home && googleSignIn().available ? <GoogleButton href="/auth/google" label={t('auth.google.continue')} className="btn-google-icon" /> : null}
                <Link className="btn btn-line top-auth-btn" href="/login">
                  {t('auth.submit_login')}
                </Link>
                <Link className="btn btn-gold top-auth-btn top-auth-register" href="/register">
                  {home ? t('auth.submit_register') : t('auth.bar.register')}
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {/* The home page says the same under its search (home.tsx), where the design leaves room for it. */}
      {home ? null : (
        <div className="ribbon" role="note">
          <div className="wrap">
            <strong>{c.ui.ribbon.label}</strong>
            <span>
              <Md text={c.ui.ribbon.text} />
            </span>
            <Link href={PAGE_PATHS.status}>{c.ui.ribbon.link}</Link>
          </div>
        </div>
      )}

      <main id="main" className={tone ? `tone-${tone}` : undefined}>
        {children}
      </main>

      <footer className="foot">
        {/* The lake and the volcano at night, behind the footer: loaded lazily, after everything that matters. */}
        <NightScene className="foot-scene" />
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <Link className="brand" href="/">
                {home ? <BrandMark home size={40} /> : <BrandMark />}
                <span>YAVAYA</span>
              </Link>
              <p className="muted mt">{c.ui.footer.about}</p>
              <p>
                <a href={c.ui.footer.whatsappHref} rel="noopener">
                  {c.ui.footer.contact} · {c.ui.footer.whatsappLabel}
                </a>
              </p>
              <p>
                <a href={SOCIAL.instagram.url} target="_blank" rel="noopener">
                  {c.ui.footer.instagram} · @{SOCIAL.instagram.handle}
                </a>
              </p>
            </div>
            {groups.map(([label, ids], g) => (
              <div key={label}>
                <h2 className="foot-h">{label}</h2>
                <ul>
                  {ids.map((id) => (
                    <li key={id}>
                      <Link href={PAGE_PATHS[id]}>{c.nav[id]}</Link>
                    </li>
                  ))}
                  {g === 0
                    ? boardLinks.map((link) => (
                        <li key={link.href}>
                          <Link href={link.href}>{link.label}</Link>
                        </li>
                      ))
                    : null}
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
        {member?.owner ? (
          <Link href="/admin">
            <Icon name="grid" />
            <span>{t('nav.panel')}</span>
          </Link>
        ) : (
          <Link href={PAGE_PATHS.trust} aria-current={cur('trust')}>
            <Icon name="shield" />
            <span>{c.nav.trust}</span>
          </Link>
        )}
        <Link href={member ? '/account' : '/login'}>
          <Icon name="id" />
          <span>{member ? t('nav.member_area') : t('nav.sign_in')}</span>
        </Link>
      </nav>
    </div>
  );
}
