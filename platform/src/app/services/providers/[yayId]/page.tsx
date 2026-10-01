import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { ProviderLine, categoryName } from '@/ui/services/parts';
import { parseYayId } from '@/server/domains/identity/yay-id';
import { providerPage, SERVICES_REPORT_CATEGORIES } from '@/server/domains/services/service';
import { reportServicesAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** A provider's record: what they do, what was checked, and what people said. Members only. */
export default async function ProviderPublicPage({ params, searchParams }: { params: Promise<{ yayId: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const [{ yayId }, query] = await Promise.all([params, searchParams]);
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const digits = parseYayId(decodeURIComponent(yayId));
  if (!digits) notFound();
  const found = await providerPage(db(), { yayDigits: digits, locale });
  if (!found) notFound();
  const { summary, bio, reviews } = found;
  const page = `/services/providers/${summary.yayId}`;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/services">← {t('services.back')}</Link>
        </p>
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <h1 className="h-md">{summary.displayName}</h1>
        <ProviderLine provider={summary} t={t} />
        <p className="sv-meta">{summary.categories.map((key) => categoryName(t, key)).join(' · ')}</p>
        {summary.licenceClaim ? (
          <p className="muted">
            {t('services.provider.licence_stated', { claim: summary.licenceClaim })}{' '}
            {summary.licenceStatus === 'verified' ? t('services.provider.licence_checked') : t('services.provider.licence_not_checked')}
          </p>
        ) : null}
        <p className="cm-body">{bio}</p>

        <section className="sc-section">
          <h2 className="sc-h">{t('services.provider.reviews')}</h2>
          {reviews.length === 0 ? (
            <p className="muted">{t('services.provider.no_reviews')}</p>
          ) : (
            <ul className="sv-reviews">
              {reviews.map((review, index) => (
                <li key={index}>
                  <strong aria-label={t('services.review.stars', { stars: review.rating })}>{'★'.repeat(review.rating)}</strong> {review.body ?? ''}
                  <span className="sv-meta"> · {formatDate(review.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {summary.userId !== userId ? (
          <details className="card sc-section">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('services.report.provider_title')}</summary>
            <form action={reportServicesAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
              <input type="hidden" name="subject" value="provider" />
              <input type="hidden" name="subjectId" value={summary.userId} />
              <input type="hidden" name="from" value={page} />
              <label>
                {t('services.report.category')}
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {SERVICES_REPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`services.report.category.${category}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('services.report.description')}
                <textarea name="description" maxLength={1000} style={{ minHeight: 70 }} />
              </label>
              <button className="btn btn-line" type="submit">
                {t('services.report.submit')}
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </SiteShell>
  );
}
