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
import { animalsReviewQueue } from '@/server/domains/animals/service';
import { resolveAnimalsReportAction, reviewRescuerAction } from '@/app/animals/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Rescuers waiting to be approved, and reports on animals. `adoptions.review` only. */
export default async function AnimalsReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'adoptions.review'))) notFound();
  const session = await currentSession();
  const queue = await animalsReviewQueue(db(), session ? { userId, status: session.user.status } : null, locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('animals.review_queue.title')}</h1>
          <p className="lead mb0">{t('animals.review_queue.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('sanctuary.review.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        <h2 className="sc-h">{t('animals.review_queue.rescuers')}</h2>
        {queue.rescuers.length === 0 ? (
          <p className="mk-empty">{t('animals.review_queue.no_rescuers')}</p>
        ) : (
          <div className="mk-queue">
            {queue.rescuers.map((rescuer) => (
              <article key={rescuer.userId} className="card">
                <p className="muted mb0">
                  {formatDate(rescuer.createdAt, locale)} · {t(`animals.rescuer.kind.${rescuer.kind}` as MessageKey)} · {rescuer.placeName}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>{rescuer.name}</h3>
                <p className="cm-body">{rescuer.about}</p>
                <p className="mb0">{t('sanctuary.review.owner', { name: rescuer.member.displayName, yayId: rescuer.member.yayId, email: rescuer.member.email })}</p>
                <p className="muted mb0">{rescuer.whatsappE164}</p>
                <form action={reviewRescuerAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="rescuerUserId" value={rescuer.userId} />
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
                  {item.code} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {item.rescuerName}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  <Link href={`/animals/${item.listingId}`}>{item.name}</Link>
                </h3>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`animals.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                    </li>
                  ))}
                </ul>
                <form action={resolveAnimalsReportAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-line" type="submit" name="decision" value="dismiss">
                      {t('sanctuary.review.dismiss')}
                    </button>
                    <button className="btn btn-gold" type="submit" name="decision" value="remove_listing">
                      {t('animals.review_queue.remove_listing')}
                    </button>
                    <button className="btn btn-gold" type="submit" name="decision" value="suspend_rescuer">
                      {t('animals.review_queue.suspend_rescuer')}
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
