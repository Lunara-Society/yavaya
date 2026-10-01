import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { facts } from '@/ui/animals/parts';
import { whatsappLink } from '@/server/domains/mercadito/rules';
import { hasPermission } from '@/server/domains/access/authorize';
import { ANIMALS_REPORT_CATEGORIES, getAnimal, type ApplicationView } from '@/server/domains/animals/service';
import { applicationStepAction, reportAnimalAction, withdrawAnimalAction } from '../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; applied?: string; published?: string; reported?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const { t, locale } = await siteContext();
  const found = await getAnimal(db(), { listingId: id, viewerId: null, viewerIsReviewer: false, locale });
  return found ? { title: `${found.animal.name} · ${t('animals.detail.looking_for_home')}`, description: found.animal.description.slice(0, 160) } : { robots: { index: false } };
}

function Answers({ app, t }: { app: ApplicationView; t: (key: MessageKey, params?: Record<string, string | number>) => string }) {
  const a = app.answers;
  const rows: Array<[MessageKey, string]> = [
    ['animals.apply.home_type', t(`animals.apply.home_type.${a.homeType}` as MessageKey)],
    ['animals.apply.tenure', t(`animals.apply.tenure.${a.tenure}` as MessageKey)],
    ['animals.apply.landlord', t(`animals.answer.${a.landlordAllows}` as MessageKey)],
    ['animals.apply.fenced', t(`animals.answer.${a.fencedYard}` as MessageKey)],
    ['animals.apply.household', a.household],
    ['animals.apply.other_animals', a.otherAnimals],
    ['animals.apply.other_sterilised', t(`animals.answer.${a.otherAnimalsSterilised}` as MessageKey)],
    ['animals.apply.experience', a.experience],
    ['animals.apply.hours_alone', String(a.hoursAlone)],
    ['animals.apply.sleeps', t(`animals.apply.sleeps.${a.sleepsWhere}` as MessageKey)],
    ['animals.apply.vet_plan', a.vetPlan],
    ['animals.apply.why', a.whyAdopt],
  ];
  return (
    <dl className="an-answers-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{t(label)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AnimalPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const reviewer = userId ? await hasPermission(db(), userId, 'adoptions.review') : false;
  const found = await getAnimal(db(), { listingId: id, viewerId: userId, viewerIsReviewer: reviewer, locale });
  if (!found) notFound();
  const { animal, photos, isRescuer, applications, myApplication, rescuerWhatsapp } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href={isRescuer ? '/animals/rescuer' : '/animals'}>← {t('animals.back')}</Link>
        </p>
        {query.published ? <p className="mk-banner" role="status">{t('animals.detail.published')}</p> : null}
        {query.applied ? <p className="mk-banner" role="status">{t('animals.detail.applied')}</p> : null}
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, { min: 1, max: 6, limit: 3, maxMegabytes: 8 })}</p> : null}

        <div className="an-detail">
          <div className="an-gallery">
            {photos.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- served from /media, pre-sized
              <img key={photo} src={`/media/${photo}`} alt={index === 0 ? animal.name : ''} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
          <div>
            {animal.status !== 'available' ? <p className="an-status-line">{t(`animals.status.${animal.status}` as MessageKey)}</p> : null}
            <h1 className="h-md">{animal.name}</h1>
            <p className="an-facts">{facts(t, animal)}</p>
            <ul className="an-health-list">
              <li className={animal.sterilised ? 'yes' : 'no'}>{animal.sterilised ? t('animals.health.sterilised') : t('animals.health.not_sterilised')}</li>
              <li className={animal.vaccinated ? 'yes' : 'no'}>{animal.vaccinated ? t('animals.health.vaccinated') : t('animals.health.not_vaccinated')}</li>
              <li className={animal.dewormed ? 'yes' : 'no'}>{animal.dewormed ? t('animals.health.dewormed') : t('animals.health.not_dewormed')}</li>
            </ul>
            <p className="cm-body">{animal.description}</p>
            {animal.temperament ? (
              <p>
                <strong>{t('animals.form.temperament')}:</strong> {animal.temperament}
              </p>
            ) : null}
            {animal.healthNotes ? (
              <p>
                <strong>{t('animals.form.health_notes')}:</strong> {animal.healthNotes}
              </p>
            ) : null}
            <p className="sv-meta">
              {t(`animals.rescuer.kind.${animal.rescuerKind}` as MessageKey)}: <strong>{animal.rescuerName}</strong> · ✓ {t('animals.rescuer.verified')} · {animal.placeName} · {formatDate(animal.createdAt, locale)}
            </p>

            {!isRescuer ? (
              <div className="an-apply-box card">
                {myApplication ? (
                  <>
                    <p className="mb0">
                      <strong>{t(`animals.application.status.${myApplication.status}` as MessageKey)}</strong>
                    </p>
                    {myApplication.decisionNote ? <p className="muted">{myApplication.decisionNote}</p> : null}
                    {rescuerWhatsapp ? (
                      <a className="btn mk-wa" style={{ marginTop: 10 }} href={whatsappLink(rescuerWhatsapp, t('animals.detail.whatsapp_message', { name: animal.name }))} target="_blank" rel="noopener noreferrer">
                        {t('animals.detail.whatsapp')}
                      </a>
                    ) : null}
                    {myApplication.status === 'submitted' || myApplication.status === 'approved' ? (
                      <form action={applicationStepAction} style={{ marginTop: 10 }}>
                        <input type="hidden" name="listingId" value={animal.id} />
                        <input type="hidden" name="applicationId" value={myApplication.id} />
                        <input type="hidden" name="step" value="withdraw" />
                        <button className="btn btn-line" type="submit">
                          {t('animals.application.withdraw')}
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : animal.status === 'available' ? (
                  <>
                    <p>{t('animals.detail.how_to_adopt')}</p>
                    <Link className="btn btn-gold" href={member ? `/animals/${animal.id}/apply` : '/login'}>
                      {t('animals.detail.apply', { name: animal.name })}
                    </Link>
                  </>
                ) : (
                  <p className="mb0">{t('animals.detail.not_available')}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isRescuer ? (
          <section id="applications" className="sc-section">
            <h2 className="sc-h">{t('animals.detail.applications')}</h2>
            {applications.length === 0 ? (
              <p className="muted">{t('animals.detail.no_applications')}</p>
            ) : (
              <div className="mk-queue">
                {applications.map((app) => (
                  <article key={app.id} className={app.status === 'approved' || app.status === 'completed' ? 'card sv-response chosen' : 'card'}>
                    <p className="sv-kicker">{t(`animals.application.status.${app.status}` as MessageKey)}</p>
                    <h3 style={{ margin: '4px 0' }}>
                      {app.applicant.displayName} <span className="muted">· {app.applicant.yayId}</span>
                    </h3>
                    <p className="sv-meta">{formatDate(app.createdAt, locale)} · {t('animals.detail.certified')}</p>
                    <Answers app={app} t={t} />
                    <p className="muted">{t('animals.detail.commitments_accepted')}</p>
                    {app.status === 'submitted' || app.status === 'approved' ? (
                      <form action={applicationStepAction} className="mk-form" style={{ maxWidth: 'none' }}>
                        <input type="hidden" name="listingId" value={animal.id} />
                        <input type="hidden" name="applicationId" value={app.id} />
                        <label>
                          {t('animals.detail.note')}
                          <textarea name="note" maxLength={1000} style={{ minHeight: 60 }} />
                        </label>
                        <div className="btn-row">
                          {app.status === 'submitted' && animal.status === 'available' ? (
                            <button className="btn btn-gold" type="submit" name="step" value="approve">
                              {t('animals.detail.choose_home')}
                            </button>
                          ) : null}
                          {app.status === 'approved' ? (
                            <button className="btn btn-gold" type="submit" name="step" value="complete">
                              {t('animals.detail.went_home', { name: animal.name })}
                            </button>
                          ) : null}
                          <button className="btn btn-line" type="submit" name="step" value="reject">
                            {t('animals.detail.decline')}
                          </button>
                        </div>
                      </form>
                    ) : app.decisionNote ? (
                      <p className="muted">{app.decisionNote}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            {animal.status === 'available' || animal.status === 'reserved' ? (
              <form action={withdrawAnimalAction} style={{ marginTop: 18 }}>
                <input type="hidden" name="listingId" value={animal.id} />
                <button className="btn btn-line" type="submit">
                  {t('animals.detail.withdraw')}
                </button>
              </form>
            ) : null}
          </section>
        ) : member ? (
          <details className="card sc-section">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('animals.report.title')}</summary>
            <form action={reportAnimalAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
              <input type="hidden" name="listingId" value={animal.id} />
              <label>
                {t('services.report.category')}
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {ANIMALS_REPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`animals.report.category.${category}` as MessageKey)}
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
