import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { TrustShieldCard } from '@/ui/components/trust-shield';
import { PageScene } from '@/ui/site/art';
import { shellContext } from '@/ui/shell-context';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { getBalance } from '@/server/domains/tokens/service';
import { hasPermission, isAdmin } from '@/server/domains/access/authorize';
import { recentActivity } from '@/server/domains/notifications/activity';
import { NEW_USER_RULES } from '@/config/business-rules';
import type { MessageKey } from '@/i18n';

export const metadata: Metadata = { title: 'Member area' };
export const dynamic = 'force-dynamic';

/**
 * Member area.
 *
 * Everything here is the member's real data: their Trust Shield, their token
 * balance, their monitoring state. Nothing is illustrative.
 *
 * The activity feed shows only real events. Before districts exist there are
 * none, so it shows an honest empty state rather than invented activity.
 */
export default async function AccountPage() {
  const { t, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect('/login');

  const [shield, balance, activity, moderator, admin] = await Promise.all([
    buildTrustShield(db(), userId),
    getBalance(db(), userId),
    recentActivity(db(), { limit: 6 }),
    hasPermission(db(), userId, 'listings.moderate'),
    isAdmin(db(), userId),
  ]);
  // Shown only to those who hold the permission; the page checks it again.
  const profileShortcut = { href: `/members/${member.yayId}`, labelKey: 'profile.mine' as MessageKey, glyph: '◉' };
  const shortcuts = moderator
    ? [profileShortcut, ...SHORTCUTS, { href: '/admin/mercadito', labelKey: 'nav.moderation' as MessageKey, glyph: '⚑' }]
    : [profileShortcut, ...SHORTCUTS];

  if (!shield) redirect('/login');

  const underMonitoring = shield.statusKey === 'trust.status.new_member';

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="member-hero">
        <PageScene name="districts" className="member-hero-photo" />
        <div className="member-hero-text">
          <p className="member-hero-eyebrow">{t('nav.member_area')}</p>
          <h1>{member.displayName}</h1>
          <p>{t('account.subtitle')}</p>
          {/* The member's own role, shown only to them. It is never part of
              the public Trust Shield: authority is not a trust signal. */}
          {admin || moderator ? (
            <p className="role-badge">
              <span aria-hidden="true">⚑</span> {t(admin ? 'account.role.admin' : 'account.role.moderator')}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-6">
        <TrustShieldCard shield={shield} t={t} />
      </div>

      {/*
        An unverified account is the one state a member can fix in thirty
        seconds, so it is the first thing offered — above the monitoring
        notice, which is only a matter of waiting.
      */}
      {!shield.emailVerified ? (
        <Link
          href="/verify"
          className="mt-4 flex min-h-touch items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
          style={{ borderColor: 'var(--color-caution)' }}
        >
          <span>{t('auth.verify.title')}</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      {underMonitoring ? (
        <p
          className="mt-4 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-caution)' }}
        >
          {t('auth.monitoring_notice', { hours: NEW_USER_RULES.monitoringWindowHours })}
        </p>
      ) : null}

      <section className="surface-card mt-6 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{t('tokens.name')}</h2>
          <p className="text-2xl font-semibold tabular-nums">{balance}</p>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tokens.description')}</p>
        <Link
          href="/account/tokens"
          className="mt-4 inline-flex min-h-touch items-center rounded-xl border px-4 text-sm font-medium"
        >
          {t('tokens.view_history')}
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">{t('account.shortcuts')}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.href}>
              <Link
                href={shortcut.href}
                className="surface-card flex min-h-touch items-center gap-3 px-4 py-3 text-sm font-medium"
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">{t('account.activity')}</h2>
        {activity.length === 0 ? (
          <p className="mt-3 rounded-xl border px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            {t('account.activity_empty')}
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border">
            {activity.map((item) => (
              <li key={item.id} className="p-3 text-sm">
                {t(`activity.${item.kind}` as MessageKey, item.params)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

const SHORTCUTS: Array<{ href: string; labelKey: MessageKey; glyph: string }> = [
  { href: '/mercadito/mine', labelKey: 'mercadito.mine.title', glyph: '▦' },
  { href: '/account/tokens', labelKey: 'nav.tokens', glyph: '◆' },
  { href: '/settings#notifications', labelKey: 'nav.notifications', glyph: '◔' },
  { href: '/settings#location', labelKey: 'nav.location', glyph: '◎' },
  { href: '/settings#security', labelKey: 'nav.security', glyph: '⛨' },
  { href: '/districts', labelKey: 'nav.districts', glyph: '◫' },
  { href: '/status', labelKey: 'nav.status', glyph: '◈' },
];
