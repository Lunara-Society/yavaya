import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { hasPermission } from '@/server/domains/access/authorize';
import { canSeeOps, queuesFor } from '@/server/domains/ops/queues';
import { OPS_RULES } from '@/config/business-rules';
import { jobHealth } from '@/server/domains/ops/alerts';
import { isAdmin } from '@/server/domains/access/authorize';
import { intlLocale } from '@/ui/mercadito/format';
import { currentSession } from '@/server/auth/context';
import { ownerOverview, type OverviewEvent } from '@/server/domains/ops/overview';
import { recentActivity, type FeedItem } from '@/server/domains/notifications/activity';
import { isTwoStepEnabled, twoStepAvailable } from '@/server/domains/identity/two-step';
import { LIVE_FEED_RULES } from '@/config/business-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Everything waiting for a person, for whoever may act on it. */
export default async function OpsPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await canSeeOps(db(), userId))) notFound();
  const [queues, canManage, admin, canReadMembers] = await Promise.all([
    queuesFor(db(), userId),
    hasPermission(db(), userId, 'roles.manage'),
    isAdmin(db(), userId),
    hasPermission(db(), userId, 'users.read'),
  ]);
  const health = admin ? await jobHealth(db()) : null;
  const session = await currentSession();
  // The owner's overview: roles.manage only; ownerOverview checks it again.
  const [overview, week, twoStepOn] = await Promise.all([
    canManage && session ? ownerOverview(db(), { userId, status: session.user.status }) : Promise.resolve(null),
    canManage ? recentActivity(db(), { week: true, limit: 40, locale }) : Promise.resolve([] as FeedItem[]),
    isTwoStepEnabled(db(), userId),
  ]);
  // One list, newest first: what members did and what the team did.
  type Line = { at: Date; key: string; text: string };
  const lines: Line[] = [
    ...week.map((item) => ({ at: item.occurredAt, key: `a-${item.id}`, text: t(`activity.${item.kind}` as MessageKey, { place: t('place.bar.everywhere'), ...item.params }) })),
    ...(overview?.events ?? []).map((event: OverviewEvent, i: number) => ({
      at: event.at,
      key: `e-${i}`,
      text: t(`ops.event.${event.action}` as MessageKey, {
        by: event.by ?? t('ops.someone'),
        who: event.who ?? t('ops.someone'),
        role: event.role ? t(`staff.role.${event.role}` as MessageKey) : '',
      }),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 30);
  const relative = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const ago = (at: Date) => {
    const minutes = Math.round((at.getTime() - Date.now()) / 60_000);
    if (minutes > -60) return relative.format(minutes, 'minute');
    if (minutes > -24 * 60) return relative.format(Math.round(minutes / 60), 'hour');
    return relative.format(Math.round(minutes / 1440), 'day');
  };
  const tick = health?.latest.find((j) => j.job === 'tick') ?? null;
  const fmt = (d: Date) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  const now = Date.now();
  const hours = (d: Date | null) => (d ? Math.floor((now - d.getTime()) / 3_600_000) : 0);
  const sorted = [...queues].sort((a, b) => b.count - a.count || hours(b.oldestAt) - hours(a.oldestAt));
  const waiting = queues.reduce((n, q) => n + q.count, 0);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('ops.title')}</h1>
          <p className="lead mb0">{waiting === 0 ? t('ops.all_clear') : t('ops.waiting', { count: waiting })}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {/* Everyone on the team holds keys to members' data: two-step first. */}
        {!twoStepOn && twoStepAvailable() ? (
          <p className="mk-banner ops-two-step" role="note">
            {t('ops.two_step_prompt')}{' '}
            <Link href="/settings/dos-pasos">{t('ops.two_step_cta')}</Link>
          </p>
        ) : null}

        {overview ? (
          <>
            <div className="ops-stats">
              <div className="ops-stat">
                <span className="ops-count">{overview.counts.members}</span>
                <span className="ops-label">{t('ops.overview.members')}</span>
              </div>
              <div className="ops-stat">
                <span className="ops-count">{overview.counts.newMembers}</span>
                <span className="ops-label">{t('ops.overview.new_members', { days: LIVE_FEED_RULES.keepDays })}</span>
              </div>
              <div className="ops-stat">
                <span className="ops-count">{overview.counts.newListings}</span>
                <span className="ops-label">{t('ops.overview.new_listings', { days: LIVE_FEED_RULES.keepDays })}</span>
              </div>
              <div className="ops-stat">
                <span className="ops-count">{waiting}</span>
                <span className="ops-label">{t('ops.overview.waiting')}</span>
              </div>
            </div>

            <section className="card ops-section">
              <h2>{t('ops.overview.latest')}</h2>
              <p className="muted">{t('ops.overview.latest_note', { days: LIVE_FEED_RULES.keepDays })}</p>
              {lines.length === 0 ? (
                <p className="muted mb0">{t('ops.overview.latest_empty', { days: LIVE_FEED_RULES.keepDays })}</p>
              ) : (
                <ul className="ops-feed">
                  {lines.map((line) => (
                    <li key={line.key}>
                      <span>{line.text}</span>
                      <time dateTime={line.at.toISOString()}>{ago(line.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card ops-section">
              <h2>{t('ops.overview.team')}</h2>
              {overview.team.length === 0 ? <p className="muted">{t('staff.none')}</p> : null}
              <ul className="ops-team">
                {overview.team.map((person) => (
                  <li key={person.id}>
                    <div>
                      <strong>{person.displayName}</strong> <span className="muted">· {person.yayId}</span>
                      <span className="ops-roles">{person.roles.map((role) => t(`staff.role.${role}` as MessageKey)).join(' · ')}</span>
                    </div>
                    <div className="ops-team-meta">
                      <span>{person.lastActiveAt ? t('ops.overview.last_active', { when: ago(person.lastActiveAt) }) : t('ops.overview.never_active')}</span>
                      <span className={person.twoStep ? 'ops-ok' : 'ops-warn'}>{person.twoStep ? t('ops.overview.two_step_on') : t('ops.overview.two_step_off')}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mb0" style={{ marginTop: 12 }}>
                <Link className="btn btn-line" href="/admin/team">
                  {t('ops.overview.team_manage')}
                </Link>
              </p>
            </section>

            <h2 className="h-md" style={{ fontSize: '1.3rem', marginTop: 28 }}>{t('ops.overview.queues')}</h2>
          </>
        ) : null}

        <div className="ops-grid">
          {sorted.map((q) => {
            const h = hours(q.oldestAt);
            const late = q.count > 0 && h >= OPS_RULES.reviewLateHours;
            return (
              <Link key={q.key} href={q.href} className={`ops-card${q.count === 0 ? ' clear' : late ? ' late' : ''}`}>
                <span className="ops-count">{q.count}</span>
                <span className="ops-label">{t(`ops.queue.${q.key}` as MessageKey)}</span>
                <span className="ops-age">
                  {q.count === 0 ? t('ops.none_waiting') : h < 1 ? t('ops.oldest_now') : h < 48 ? t('ops.oldest_hours', { count: h }) : t('ops.oldest_days', { count: Math.floor(h / 24) })}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 18 }}>{t('ops.late_note', { hours: OPS_RULES.reviewLateHours })}</p>
        {health ? (
          <section className="card" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: '1.2rem', marginTop: 0 }}>{t('ops.jobs.title')}</h2>
            <p className={tick && now - tick.startedAt.getTime() > 3_600_000 ? 'mk-error' : 'muted'}>
              {!tick ? t('ops.jobs.never') : now - tick.startedAt.getTime() > 3_600_000 ? t('ops.jobs.stale') : t('ops.jobs.last_tick', { when: fmt(tick.startedAt) })}
            </p>
            {health.failures.length === 0 ? (
              <p className="muted mb0">{t('ops.jobs.no_failures')}</p>
            ) : (
              <>
                <p className="mb0"><strong>{t('ops.jobs.failures')}</strong></p>
                <ul>
                  {health.failures.map((f) => (
                    <li key={f.id}>
                      <code>{f.job}</code> · {fmt(f.startedAt)} · {f.summary.slice(0, 200)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : null}
        {canManage || canReadMembers ? (
          <p className="btn-row" style={{ marginTop: 18 }}>
            {canManage ? (
              <Link className="btn btn-gold" href="/admin/team">
                {t('staff.title')}
              </Link>
            ) : null}
            {canReadMembers ? (
              <Link className="btn btn-line" href="/admin/members">
                {t('sanctions.title')}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </SiteShell>
  );
}
