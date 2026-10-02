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

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Everything waiting for a person, for whoever may act on it. */
export default async function OpsPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await canSeeOps(db(), userId))) notFound();
  const [queues, canManage, admin] = await Promise.all([queuesFor(db(), userId), hasPermission(db(), userId, 'roles.manage'), isAdmin(db(), userId)]);
  const health = admin ? await jobHealth(db()) : null;
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
        {canManage ? (
          <p className="btn-row" style={{ marginTop: 18 }}>
            <Link className="btn btn-gold" href="/admin/team">
              {t('staff.title')}
            </Link>
          </p>
        ) : null}
      </div>
    </SiteShell>
  );
}
