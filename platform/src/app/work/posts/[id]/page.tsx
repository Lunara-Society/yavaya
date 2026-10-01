import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { WORK_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { whatsappLink } from '@/server/domains/mercadito/rules';
import { hasPermission } from '@/server/domains/access/authorize';
import { getPost, getProfile, WORK_REPORT_CATEGORIES } from '@/server/domains/work/service';
import { applicationStepAction, applyAction, closePostAction, reportWorkAction } from '../../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; applied?: string; published?: string; reported?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const { locale } = await siteContext();
  const found = await getPost(db(), { postId: id, viewerId: null, viewerIsModerator: false, locale });
  return found ? { title: `${found.post.title} · ${found.post.payText}`, description: found.post.description.slice(0, 160) } : { robots: { index: false } };
}

export default async function WorkPostPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const moderator = userId ? await hasPermission(db(), userId, 'work.moderate') : false;
  const [found, profile] = await Promise.all([getPost(db(), { postId: id, viewerId: userId, viewerIsModerator: moderator, locale }), userId ? getProfile(db(), userId) : Promise.resolve(null)]);
  if (!found) notFound();
  const { post, isEmployer, applications, myApplication, employerWhatsapp, employerReputation } = found;
  const page = `/work/posts/${post.id}`;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const limits = { min: WORK_RULES.messageMinLength, max: WORK_RULES.messageMaxLength, limit: WORK_RULES.maxOpenApplicationsPerCandidate };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href={isEmployer ? '/work/mine' : '/work'}>← {t('work.back')}</Link>
        </p>
        {query.published ? <p className="mk-banner" role="status">{t('work.post.published')}</p> : null}
        {query.applied ? <p className="mk-banner" role="status">{t('work.post.applied')}</p> : null}
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, limits)}</p> : null}

        <article className="sv-detail">
          <p className="sv-kicker">
            {t(`work.kind.${post.kind}` as MessageKey)} · {t(`work.field.${post.field}` as MessageKey)} · {t(`work.status.${post.status}` as MessageKey)}
          </p>
          <h1 className="h-md">{post.title}</h1>
          <p className="wk-pay big">{post.payText}</p>
          <p className="sv-meta">
            {post.companyName ? `${post.companyName} · ` : ''}
            {post.employerVerified ? <span className="wk-verified">✓ {t(`work.employer.verified_${post.employerVerified}` as MessageKey)} · </span> : null}
            {post.placeName} · {t(`work.place_mode.${post.placeMode}` as MessageKey)} · {t(`work.employment.${post.employment}` as MessageKey)}
          </p>
          <p className="sv-meta">
            {t('work.post.by', { name: post.employerName, score: employerReputation })} · {formatDate(post.createdAt, locale)} · {t('work.post.open_until', { date: formatDate(post.expiresAt, locale) })}
          </p>
          <p className="cm-body">{post.description}</p>
          {post.requirements ? (
            <>
              <h2 className="sc-h-sm">{t('work.form.requirements')}</h2>
              <p className="cm-body">{post.requirements}</p>
            </>
          ) : null}
          <p className="an-warning">{t('work.post.never_pay')}</p>
        </article>

        {isEmployer ? (
          <section id="applications" className="sc-section">
            <h2 className="sc-h">{t('work.post.applications_title')}</h2>
            {applications.length === 0 ? (
              <p className="muted">{t('work.post.no_applications')}</p>
            ) : (
              <div className="sv-responses">
                {applications.map((app) => (
                  <div key={app.id} className={app.status === 'hired' || app.status === 'shortlisted' ? 'card sv-response chosen' : 'card sv-response'}>
                    <p className="sv-kicker">{t(`work.application.status.${app.status}` as MessageKey)}</p>
                    {app.candidate ? (
                      <div className="sv-provider">
                        <p className="sv-provider-name">
                          <Link href={`/work/pros/${app.candidate.yayId}`}>{app.candidate.displayName}</Link>
                        </p>
                        <p className="sv-meta">{app.candidate.headline} · {app.candidate.placeName}</p>
                        <p className="sv-meta">
                          {t('services.provider.reputation', { score: app.candidate.reputation })}
                          {app.candidate.experienceYears !== null ? ` · ${t('work.profile.years', { count: app.candidate.experienceYears })}` : ''}
                        </p>
                      </div>
                    ) : null}
                    <p className="cm-body">{app.message}</p>
                    <div className="btn-row">
                      {app.whatsappE164 ? (
                        <a className="btn mk-wa" href={whatsappLink(app.whatsappE164, t('work.post.whatsapp_to_candidate', { title: post.title }))} target="_blank" rel="noopener noreferrer">
                          {t('services.response.whatsapp')}
                        </a>
                      ) : null}
                    </div>
                    {app.status === 'submitted' || app.status === 'shortlisted' ? (
                      <form action={applicationStepAction} className="mk-form" style={{ maxWidth: 'none', marginTop: 12 }}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="applicationId" value={app.id} />
                        <label>
                          {t('work.post.note')}
                          <textarea name="note" maxLength={1000} style={{ minHeight: 60 }} />
                        </label>
                        <div className="btn-row">
                          {app.status === 'submitted' ? (
                            <button className="btn btn-line" type="submit" name="step" value="shortlist">
                              {t('work.post.shortlist')}
                            </button>
                          ) : null}
                          <button className="btn btn-gold" type="submit" name="step" value="hire">
                            {t('work.post.hire')}
                          </button>
                          <button className="btn btn-line" type="submit" name="step" value="decline">
                            {t('work.post.decline')}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {post.status === 'open' ? (
              <div className="btn-row" style={{ marginTop: 18 }}>
                <form action={closePostAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="outcome" value="filled" />
                  <button className="btn btn-gold" type="submit">
                    {t('work.post.filled')}
                  </button>
                </form>
                <form action={closePostAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="outcome" value="closed" />
                  <button className="btn btn-line" type="submit">
                    {t('work.post.close')}
                  </button>
                </form>
              </div>
            ) : null}
          </section>
        ) : (
          <section id="apply" className="sc-section">
            {myApplication ? (
              <div className="card">
                <p className="mb0">
                  <strong>{t(`work.application.status.${myApplication.status}` as MessageKey)}</strong>
                </p>
                {myApplication.decisionNote ? <p className="muted">{myApplication.decisionNote}</p> : null}
                {employerWhatsapp ? (
                  <a className="btn mk-wa" style={{ marginTop: 10 }} href={whatsappLink(employerWhatsapp, t('work.post.whatsapp_to_employer', { title: post.title }))} target="_blank" rel="noopener noreferrer">
                    {t('work.post.contact_employer')}
                  </a>
                ) : null}
                {myApplication.status === 'submitted' || myApplication.status === 'shortlisted' ? (
                  <form action={applicationStepAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="applicationId" value={myApplication.id} />
                    <input type="hidden" name="step" value="withdraw" />
                    <button className="btn btn-line" type="submit">
                      {t('animals.application.withdraw')}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : post.status !== 'open' ? (
              <p className="muted">{t('work.error.closed')}</p>
            ) : !member ? (
              <div className="cm-gate card">
                <p>{t('work.post.sign_in_to_apply')}</p>
                <Link className="btn btn-gold" href="/login">
                  {t('community.square.sign_in')}
                </Link>
              </div>
            ) : !profile ? (
              <div className="card">
                <p>{t('work.post.need_profile')}</p>
                <Link className="btn btn-gold" href={`/work/profile?next=${post.id}`}>
                  {t('work.board.create_profile')}
                </Link>
              </div>
            ) : (
              <form action={applyAction} className="mk-form" style={{ maxWidth: 'none' }}>
                <input type="hidden" name="postId" value={post.id} />
                <h2 className="sc-h">{t('work.post.apply_title')}</h2>
                <p className="muted">{t('work.post.apply_lead')}</p>
                <label>
                  {t('work.post.message')}
                  <span className="hint">{t('work.post.message_hint')}</span>
                  <textarea name="message" required minLength={WORK_RULES.messageMinLength} maxLength={WORK_RULES.messageMaxLength} />
                </label>
                <button className="btn btn-gold" type="submit">
                  {t('work.post.apply_submit')}
                </button>
              </form>
            )}

            {member ? (
              <details className="card sc-section">
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('work.report.title')}</summary>
                <form action={reportWorkAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="subject" value="post" />
                  <input type="hidden" name="subjectId" value={post.id} />
                  <input type="hidden" name="from" value={page} />
                  <label>
                    {t('services.report.category')}
                    <select name="category" required defaultValue="">
                      <option value="" disabled>
                        {t('mercadito.form.choose')}
                      </option>
                      {WORK_REPORT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(`work.report.category.${category}` as MessageKey)}
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
          </section>
        )}
      </div>
    </SiteShell>
  );
}
