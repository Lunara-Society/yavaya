import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { workReviewQueue } from '@/server/domains/work/service';
import { resolveWorkReportAction } from '@/app/work/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Reports on job posts and professional profiles. `work.moderate` only. */
export default async function WorkModerationPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'work.moderate'))) notFound();
  const session = await currentSession();
  const queue = await workReviewQueue(db(), session ? { userId, status: session.user.status } : null, locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('work.moderation.title')}</h1>
          <p className="lead mb0">{t('work.moderation.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('sanctuary.review.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        {queue.length === 0 ? (
          <p className="mk-empty">{t('sanctuary.review.no_reports')}</p>
        ) : (
          <div className="mk-queue">
            {queue.map((item) => (
              <article key={item.ticketId} className="card">
                <p className="muted mb0">
                  {item.code} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {t(`work.moderation.kind.${item.kind}` as MessageKey)}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  {item.kind === 'post' ? <Link href={`/work/posts/${item.subjectId}`}>{item.label}</Link> : item.yayId ? <Link href={`/work/pros/${item.yayId}`}>{item.label}</Link> : item.label}
                </h3>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`work.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                    </li>
                  ))}
                </ul>
                <form action={resolveWorkReportAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-line" type="submit" name="decision" value="dismiss">
                      {t('sanctuary.review.dismiss')}
                    </button>
                    <button className="btn btn-gold" type="submit" name="decision" value={item.kind === 'post' ? 'remove_post' : 'suspend_profile'}>
                      {item.kind === 'post' ? t('work.moderation.remove_post') : t('work.moderation.suspend_profile')}
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
