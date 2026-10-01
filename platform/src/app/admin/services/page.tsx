import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { categoryName } from '@/ui/services/parts';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { servicesReviewQueue } from '@/server/domains/services/service';
import { resolveServicesReportAction, reviewLicenceAction } from '@/app/services/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Licences waiting to be checked, and reports on requests and providers. `services.review` only. */
export default async function ServicesReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'services.review'))) notFound();
  const session = await currentSession();
  const queue = await servicesReviewQueue(db(), session ? { userId, status: session.user.status } : null, locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('services.review_queue.title')}</h1>
          <p className="lead mb0">{t('services.review_queue.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('sanctuary.review.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        <h2 className="sc-h">{t('services.review_queue.licences')}</h2>
        {queue.licences.length === 0 ? (
          <p className="mk-empty">{t('services.review_queue.no_licences')}</p>
        ) : (
          <div className="mk-queue">
            {queue.licences.map((provider) => (
              <article key={provider.userId} className="card">
                <p className="muted mb0">
                  {provider.yayId} · {provider.placeName} · {provider.categories.map((key) => categoryName(t, key)).join(', ')}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  <Link href={`/services/providers/${provider.yayId}`}>{provider.displayName}</Link>
                </h3>
                <p className="cm-body">
                  <strong>{t('services.provider.licence')}:</strong> {provider.licenceClaim}
                </p>
                <form action={reviewLicenceAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="providerUserId" value={provider.userId} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-gold" type="submit" name="decision" value="verify">
                      {t('services.review_queue.verify')}
                    </button>
                    <button className="btn btn-line" type="submit" name="decision" value="reject">
                      {t('services.review_queue.reject')}
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
                  {item.code} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {t(`services.review_queue.kind.${item.kind}` as MessageKey)}
                </p>
                <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                  {item.kind === 'request' ? <Link href={`/services/requests/${item.subjectId}`}>{item.label}</Link> : item.providerYayId ? <Link href={`/services/providers/${item.providerYayId}`}>{item.label}</Link> : item.label}
                </h3>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`services.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                    </li>
                  ))}
                </ul>
                <form action={resolveServicesReportAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('sanctuary.review.note')}
                    <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    <button className="btn btn-line" type="submit" name="decision" value="dismiss">
                      {t('sanctuary.review.dismiss')}
                    </button>
                    <button className="btn btn-gold" type="submit" name="decision" value={item.kind === 'request' ? 'remove_request' : 'suspend_provider'}>
                      {item.kind === 'request' ? t('services.review_queue.remove_request') : t('services.review_queue.suspend_provider')}
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
