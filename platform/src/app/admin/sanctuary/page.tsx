import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { reviewQueue } from '@/server/domains/sanctuary/service';
import { reviewChurchAction, resolveSanctuaryReportAction } from '@/app/sanctuary/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Churches waiting for review, and reports on approved ones. `sanctuary.review` only. */
export default async function SanctuaryReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'sanctuary.review'))) notFound();
  const session = await currentSession();
  const queue = await reviewQueue(db(), session ? { userId, status: session.user.status } : null, locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('sanctuary.review.title')}</h1>
          <p className="lead mb0">{t('sanctuary.review.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.done ? (
          <p className="mk-banner" role="status">
            {t('sanctuary.review.done')}
          </p>
        ) : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        <h2 className="sc-h">{t('sanctuary.review.pending')}</h2>
        {queue.pending.length === 0 ? (
          <p className="mk-empty">{t('sanctuary.review.none')}</p>
        ) : (
          <div className="mk-queue">
            {queue.pending.map((church) => (
              <article key={church.id} className="card">
                <p className="muted mb0">
                  {formatDate(church.createdAt, locale)} · {church.placeName}
                  {church.denomination ? ` · ${church.denomination}` : ''}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  <Link href={`/sanctuary/churches/${church.id}`}>{church.name}</Link>
                </h3>
                <p className="cm-body cm-clamp">{church.description}</p>
                <p className="mb0">{t('sanctuary.review.owner', { name: church.owner.displayName, yayId: church.owner.yayId, email: church.owner.email })}</p>
                <p className="mb0 muted">
                  {[church.address, church.whatsappE164, church.streamUrl].filter(Boolean).join(' · ') || '—'}
                </p>
                <form action={reviewChurchAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="churchId" value={church.id} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-gold" type="submit" name="decision" value="approve">
                      {t('sanctuary.review.approve')}
                    </button>
                    <button className="btn btn-line" type="submit" name="decision" value="reject">
                      {t('sanctuary.review.reject')}
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}

        <h2 className="sc-h" style={{ marginTop: 40 }}>
          {t('sanctuary.review.reports')}
        </h2>
        {queue.reports.length === 0 ? (
          <p className="mk-empty">{t('sanctuary.review.no_reports')}</p>
        ) : (
          <div className="mk-queue">
            {queue.reports.map((item) => (
              <article key={item.ticketId} className="card">
                <p className="muted mb0">
                  {item.ticketCode} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {t(`sanctuary.status.${item.church.status}` as MessageKey)}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  <Link href={`/sanctuary/churches/${item.church.id}`}>{item.church.name}</Link>
                </h3>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`sanctuary.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                      {report.devotionalTitle ? (
                        <>
                          <br />
                          <em>{t('sanctuary.review.reported_word', { title: report.devotionalTitle })}</em>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <form action={resolveSanctuaryReportAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-line" type="submit" name="decision" value="dismiss">
                      {t('sanctuary.review.dismiss')}
                    </button>
                    {item.reports.some((report) => report.devotionalTitle) ? (
                      <button className="btn btn-gold" type="submit" name="decision" value="remove_devotionals">
                        {t('sanctuary.review.remove_words')}
                      </button>
                    ) : null}
                    <button className="btn btn-gold" type="submit" name="decision" value="suspend_church">
                      {t('sanctuary.review.suspend_church')}
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
