import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SERVICES_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { CategoryIcon, ProviderLine, categoryName } from '@/ui/services/parts';
import { whatsappLink } from '@/server/domains/mercadito/rules';
import { hasPermission } from '@/server/domains/access/authorize';
import { getRequest, SERVICES_REPORT_CATEGORIES } from '@/server/domains/services/service';
import { reportServicesAction, requestStepAction, respondAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; created?: string; responded?: string; reported?: string }> };

export default async function RequestPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!UUID.test(id)) notFound();
  const moderator = await hasPermission(db(), userId, 'moderation.queue.read');
  const found = await getRequest(db(), { requestId: id, viewerId: userId, viewerIsModerator: moderator, locale });
  if (!found) notFound();
  const { request, responses, review } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const limits = { min: SERVICES_RULES.messageMinLength, max: SERVICES_RULES.messageMaxLength };
  const page = `/services/requests/${request.id}`;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href={request.isMine ? '/services/mine' : '/services'}>← {t('services.back')}</Link>
        </p>
        {query.created ? <p className="mk-banner" role="status">{request.urgent ? t('services.request.created_urgent') : t('services.request.created')}</p> : null}
        {query.responded ? <p className="mk-banner" role="status">{t('services.response.sent')}</p> : null}
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, limits)}</p> : null}

        <article className={request.urgent && request.status === 'open' ? 'sv-detail sv-urgent' : 'sv-detail'}>
          <p className="sv-kicker">
            <span className="sv-icon sm" aria-hidden="true">
              <CategoryIcon category={request.category} />
            </span>
            {request.urgent && request.status === 'open' ? <span className="sv-today">{t('services.urgent.badge')}</span> : null}
            {categoryName(t, request.category)} · {t(`services.status.${request.status}` as MessageKey)}
          </p>
          <h1 className="h-md">{request.title}</h1>
          <p className="cm-body">{request.body}</p>
          <p className="sv-meta">
            {request.isMine ? t('services.request.yours') : (request.requesterName ?? t('services.request.name_hidden'))} · {request.placeName} · {formatDate(request.createdAt, locale)}
          </p>
        </article>

        {request.isMine ? (
          <section id="responses" className="sc-section">
            <h2 className="sc-h">{t('services.request.responses_title')}</h2>
            {responses.length === 0 ? (
              <p className="muted">{request.status === 'open' ? t('services.request.waiting') : t('services.request.no_responses')}</p>
            ) : (
              <div className="sv-responses">
                {responses.map((response) => (
                  <div key={response.id} className={response.status === 'accepted' ? 'card sv-response chosen' : 'card sv-response'}>
                    {response.status === 'accepted' ? <p className="sv-chosen">✓ {t('services.response.chosen')}</p> : null}
                    {response.provider ? <ProviderLine provider={response.provider} t={t} /> : null}
                    <p className="cm-body">{response.message}</p>
                    {response.priceText ? <p className="sv-price">{t('services.response.price', { price: response.priceText })}</p> : null}
                    <div className="btn-row">
                      {response.whatsappE164 ? (
                        <a className="btn mk-wa" href={whatsappLink(response.whatsappE164, t('services.response.whatsapp_message', { title: request.title }))} target="_blank" rel="noopener noreferrer">
                          {t('services.response.whatsapp')}
                        </a>
                      ) : null}
                      {request.status === 'open' && response.status === 'sent' ? (
                        <form action={requestStepAction}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="responseId" value={response.id} />
                          <input type="hidden" name="step" value="accept" />
                          <button className="btn btn-line" type="submit">
                            {t('services.response.choose')}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="muted sc-hint">{t('services.request.contact_note')}</p>

            <div className="btn-row" style={{ marginTop: 18 }}>
              {request.status === 'in_progress' ? (
                <form action={requestStepAction}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="step" value="complete" />
                  <button className="btn btn-gold" type="submit">
                    {t('services.request.complete')}
                  </button>
                </form>
              ) : null}
              {request.status === 'open' || request.status === 'in_progress' ? (
                <form action={requestStepAction}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="step" value="cancel" />
                  <button className="btn btn-line" type="submit">
                    {t('services.request.cancel')}
                  </button>
                </form>
              ) : null}
            </div>

            {request.status === 'completed' && !review ? (
              <form action={requestStepAction} className="mk-form card" style={{ marginTop: 24, maxWidth: 'none' }}>
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="step" value="review" />
                <h3>{t('services.review.title')}</h3>
                <fieldset className="sv-stars">
                  <legend>{t('services.review.rating')}</legend>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <label key={n}>
                      <input type="radio" name="rating" value={n} required /> {'★'.repeat(n)}
                      <span className="sr-only">{t('services.review.stars', { stars: n })}</span>
                    </label>
                  ))}
                </fieldset>
                <label>
                  {t('services.review.body')}
                  <textarea name="body" maxLength={SERVICES_RULES.reviewMaxLength} style={{ minHeight: 80 }} />
                </label>
                <button className="btn btn-gold" type="submit">
                  {t('services.review.submit')}
                </button>
              </form>
            ) : null}
            {review ? (
              <p className="card" style={{ marginTop: 24 }}>
                {t('services.review.yours', { stars: review.rating })} {review.body ? `— ${review.body}` : ''}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="sc-section">
            {responses.length > 0 ? (
              <div className="card sv-response">
                <p className="sv-chosen">{responses[0]!.status === 'accepted' ? `✓ ${t('services.response.you_were_chosen')}` : t('services.response.yours')}</p>
                <p className="cm-body">{responses[0]!.message}</p>
                {responses[0]!.priceText ? <p className="sv-price">{t('services.response.price', { price: responses[0]!.priceText })}</p> : null}
              </div>
            ) : null}
            {request.canRespond ? (
              <form action={respondAction} className="mk-form" style={{ marginTop: 18, maxWidth: 'none' }}>
                <input type="hidden" name="requestId" value={request.id} />
                <h2 className="sc-h">{t('services.response.title')}</h2>
                <label>
                  {t('services.response.message')}
                  <span className="hint">{t('services.response.message_hint')}</span>
                  <textarea name="message" required minLength={SERVICES_RULES.messageMinLength} maxLength={SERVICES_RULES.messageMaxLength} />
                </label>
                <label>
                  {t('services.response.price_label')}
                  <span className="hint">{t('services.response.price_hint')}</span>
                  <input name="priceText" maxLength={SERVICES_RULES.priceMaxLength} />
                </label>
                <p className="muted">{t('services.response.consent')}</p>
                <button className="btn btn-gold" type="submit">
                  {t('services.response.submit')}
                </button>
              </form>
            ) : request.cannotRespondReason && request.cannotRespondReason !== 'services.error.already_responded' ? (
              <div className="mk-banner" style={{ marginTop: 18 }}>
                <p className="mb0">{t(request.cannotRespondReason as MessageKey, { limit: SERVICES_RULES.maxResponsesPerRequest })}</p>
                {['services.error.need_profile', 'services.error.not_your_category', 'services.error.licence_required'].includes(request.cannotRespondReason) ? (
                  <Link className="btn btn-line" href="/services/provider" style={{ marginTop: 12 }}>
                    {t('services.board.offer')}
                  </Link>
                ) : null}
              </div>
            ) : null}

            <details className="card sc-section">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('services.report.title')}</summary>
              <form action={reportServicesAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                <input type="hidden" name="subject" value="request" />
                <input type="hidden" name="subjectId" value={request.id} />
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
          </section>
        )}
      </div>
    </SiteShell>
  );
}
