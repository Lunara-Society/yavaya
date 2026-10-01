import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { employerReviewQueue, workReviewQueue } from '@/server/domains/work/service';
import { resolveWorkReportAction, reviewEmployerAction } from '@/app/work/actions';
import { formatDate } from '@/ui/mercadito/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Employers waiting for verification (`work.review`), and reports on posts and profiles (`work.moderate`). */
export default async function WorkModerationPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [canModerate, canReview] = await Promise.all([hasPermission(db(), userId, 'work.moderate'), hasPermission(db(), userId, 'work.review')]);
  if (!canModerate && !canReview) notFound();
  const session = await currentSession();
  const actor = session ? { userId, status: session.user.status } : null;
  const [queue, employers] = await Promise.all([canModerate ? workReviewQueue(db(), actor, locale) : [], canReview ? employerReviewQueue(db(), actor) : []]);
  const pending = employers.filter((e) => e.status === 'pending');
  const approved = employers.filter((e) => e.status === 'approved');
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
        {canReview ? (
          <section id="employers" style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: '1.3rem' }}>{t('work.employer.review_title', { count: pending.length })}</h2>
            <p className="muted">{t('work.employer.review_guidance')}</p>
            {pending.length === 0 ? <p className="mk-empty">{t('work.employer.review_empty')}</p> : null}
            <div className="mk-queue">
              {pending.map((e) => (
                <article key={e.userId} className="card">
                  <p className="muted mb0">
                    {t(`work.employer.kind.${e.kind}` as MessageKey)} · {e.placeName} · {t('work.employer.account', { name: e.displayName, yay: e.yayId, date: formatDate(e.accountCreatedAt, locale) })}
                  </p>
                  <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>{e.name}</h3>
                  {e.registration ? <p className="mb0"><strong>{t('work.employer.registration')}:</strong> {e.registration}</p> : null}
                  <p className="cm-body">{e.about}</p>
                  <p className="muted">
                    WhatsApp {e.whatsappE164}
                    {e.website ? <> · <a href={e.website} target="_blank" rel="noopener noreferrer nofollow">{e.website}</a></> : null}
                  </p>
                  <form action={reviewEmployerAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                    <input type="hidden" name="employerUserId" value={e.userId} />
                    <label>
                      {t('work.employer.review_note_label')}
                      <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                    </label>
                    <div className="btn-row">
                      <button className="btn btn-gold" type="submit" name="decision" value="approve">
                        {t('work.employer.approve')}
                      </button>
                      <button className="btn btn-line" type="submit" name="decision" value="reject">
                        {t('work.employer.reject')}
                      </button>
                    </div>
                  </form>
                </article>
              ))}
            </div>
            {approved.length > 0 ? (
              <details style={{ marginTop: 18 }}>
                <summary>{t('work.employer.approved_list', { count: approved.length })}</summary>
                <ul className="wk-approved">
                  {approved.map((e) => (
                    <li key={e.userId}>
                      <strong>{e.name}</strong> · {t(`work.employer.kind.${e.kind}` as MessageKey)} · {e.placeName}
                      <form action={reviewEmployerAction} className="btn-row">
                        <input type="hidden" name="employerUserId" value={e.userId} />
                        <input name="note" required maxLength={1000} placeholder={t('work.employer.suspend_reason')} />
                        <button className="btn btn-line" type="submit" name="decision" value="suspend">
                          {t('work.employer.suspend')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
        {!canModerate ? null : queue.length === 0 ? (
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
