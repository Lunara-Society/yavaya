import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import type { LanguagePreference, ThemePreference } from '@/server/preferences';
import { QuickControls } from '@/ui/components/quick-controls';
import { Alive } from './alive';
import { DISTRICT_IDS, PAGE_PATHS, type PageId } from './blocks';
import { Icon, Mark } from './icons';
import { Md } from './md';

/** `unread` is the count of unread notifications, shown on the bell. */
export type ShellMember = { yayId: string; displayName: string; unread?: number } | null;

/**
 * The frame around every page: public pages and the member area alike, so
 * Yavaya looks like one place whether or not someone is signed in.
 *
 * Sign-in and account links come from the real session. The ribbon says
 * plainly what is open and what is not; it is content, not decoration.
 */
export function SiteShell({
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
  const primary: PageId[] = ['districts', 'trust', 'reputation', 'tokens', 'status'];
  const groups: Array<[string, PageId[]]> = [
    [c.ui.menu.districts, ['districts', ...DISTRICT_IDS]],
    [c.ui.menu.platform, ['trust', 'reputation', 'tokens', 'pricing', 'transparency']],
    [c.ui.menu.yavaya, ['about', 'roadmap', 'status', 'help', 'privacy', 'terms']],
  ];

  return (
    <div className="site" data-district={district}>
      <Alive />
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
            {member ? (
              <>
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
        </div>
      </footer>

      <nav className="dock" aria-label={c.ui.dockLabel}>
        <Link href="/" aria-current={cur('home')}>
          <Icon name="home" />
          <span>{c.nav.home}</span>
        </Link>
        <Link href={PAGE_PATHS.districts} aria-current={cur('districts')}>
          <Icon name="grid" />
          <span>{c.nav.districts}</span>
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
