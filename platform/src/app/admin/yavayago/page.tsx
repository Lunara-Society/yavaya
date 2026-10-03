import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { driverReviewQueue, storeReviewQueue } from '@/server/domains/go/service';
import { reviewDriverAction, reviewStoreAction } from '@/app/yavayago/actions';
import { formatDate } from '@/ui/mercadito/format';
import { money } from '@/ui/go/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * YavayaGo's two gates: stores (`stores.review`) and drivers
 * (`drivers.review` to see, `drivers.approve` to decide). A driver's identity
 * document opens only from here, through a route that checks the permission.
 */
export default async function GoReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [canStores, canDrivers] = await Promise.all([hasPermission(db(), userId, 'stores.review'), hasPermission(db(), userId, 'drivers.review')]);
  if (!canStores && !canDrivers) notFound();
  const session = await currentSession();
  const actor = session ? { userId, status: session.user.status } : null;
  const [stores, drivers] = await Promise.all([canStores ? storeReviewQueue(db(), actor) : [], canDrivers ? driverReviewQueue(db(), actor) : []]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const Decide = ({ decisions }: { decisions: Array<'approve' | 'reject' | 'suspend' | 'reinstate'> }) => (
    <div className="btn-row">
      {decisions.map((decision) => (
        <button key={decision} className={decision === 'approve' || decision === 'reinstate' ? 'btn btn-gold' : 'btn btn-line'} type="submit" name="decision" value={decision}>
          {t(`go.review.${decision}` as MessageKey)}
        </button>
      ))}
    </div>
  );

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('go.review.title')}</h1>
          <p className="lead mb0">{t('go.review.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.saved ? <p className="mk-banner" role="status">{t('sanctuary.review.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        {canDrivers ? (
          <section id="drivers" style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: '1.3rem' }}>{t('go.review.drivers', { count: drivers.filter((d) => d.status === 'pending').length })}</h2>
            <p className="muted">{t('go.review.drivers_guidance')}</p>
            {drivers.length === 0 ? <p className="mk-empty">{t('go.review.empty')}</p> : null}
            <div className="mk-queue">
              {drivers.map((d) => (
                <article key={d.userId} className="card go-review-card">
                  <div className="go-review-photos">
                    <figure>
                      <img src={`/media/${d.photoMediaId}`} alt="" />
                      <figcaption>{t('go.review.face')}</figcaption>
                    </figure>
                    <figure>
                      <a href={`/api/go/documents/${d.documentMediaId}`} target="_blank" rel="noopener noreferrer">
                        <img src={`/api/go/documents/${d.documentMediaId}`} alt="" />
                      </a>
                      <figcaption>{t('go.review.document')}</figcaption>
                    </figure>
                  </div>
                  <p className="muted mb0">
                    <span className={`go-status s-${d.status}`}>{t(`go.driver.state.${d.status}` as MessageKey)}</span> · {d.placeName} · {t('work.employer.account', { name: d.displayName, yay: d.yayId, date: formatDate(d.accountCreatedAt, locale) })}
                  </p>
                  <p>
                    {t(`go.vehicle.${d.vehicleType}` as MessageKey)} · {d.vehicleDescription}
                    {d.plate ? <span className="go-plate">{d.plate}</span> : null}
                  </p>
                  <p className="muted">
                    WhatsApp <a href={`https://wa.me/${d.whatsappE164.replace(/^\+/, '')}`}>{d.whatsappE164}</a> · {d.phoneVerifiedAt ? t('go.review.phone_sms_verified') : t('go.review.phone_not_verified')}
                  </p>
                  {d.reviewNote ? <p className="muted">{t('go.review.last_note', { note: d.reviewNote })}</p> : null}
                  <form action={reviewDriverAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                    <input type="hidden" name="driverUserId" value={d.userId} />
                    <label>
                      <span>{t('go.review.note')}</span>
                      <textarea name="note" maxLength={600} placeholder={t('go.review.note_hint_driver')} />
                    </label>
                    {d.status === 'pending' ? (
                      <label className="go-check">
                        <input type="checkbox" name="phoneConfirmed" /> {t('go.review.phone_confirmed')}
                      </label>
                    ) : null}
                    <Decide decisions={d.status === 'pending' ? ['approve', 'reject'] : d.status === 'approved' ? ['suspend'] : ['reinstate']} />
                  </form>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {canStores ? (
          <section id="stores">
            <h2 style={{ fontSize: '1.3rem' }}>{t('go.review.stores', { count: stores.filter((s) => s.status === 'pending').length })}</h2>
            <p className="muted">{t('go.review.stores_guidance')}</p>
            {stores.length === 0 ? <p className="mk-empty">{t('go.review.empty')}</p> : null}
            <div className="mk-queue">
              {stores.map((s) => (
                <article key={s.id} className="card">
                  {s.photoMediaId ? <img className="go-review-store-photo" src={`/media/${s.photoMediaId}`} alt="" /> : null}
                  <p className="muted mb0">
                    <span className={`go-status s-${s.status}`}>{t(`go.store.state.${s.status}` as MessageKey)}</span> · {t(`go.category.${s.category}` as MessageKey)} · {s.placeName} ·{' '}
                    {t('work.employer.account', { name: s.ownerName, yay: s.ownerYayId, date: formatDate(s.accountCreatedAt, locale) })}
                  </p>
                  <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>
                    <Link href={`/yavayago/stores/${s.id}`}>{s.name}</Link>
                  </h3>
                  <p className="cm-body">{s.about}</p>
                  <p className="muted">
                    {s.address} ·{' '}
                    <a href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} target="_blank" rel="noopener noreferrer">
                      {t('go.review.see_on_map')}
                    </a>{' '}
                    · WhatsApp {s.whatsappE164} · {t('go.store.delivery_fee', { fee: money(s.deliveryFeeMinor, s.currency) })}
                  </p>
                  {s.reviewNote ? <p className="muted">{t('go.review.last_note', { note: s.reviewNote })}</p> : null}
                  <form action={reviewStoreAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                    <input type="hidden" name="storeId" value={s.id} />
                    <label>
                      <span>{t('go.review.note')}</span>
                      <textarea name="note" maxLength={600} placeholder={t('go.review.note_hint_store')} />
                    </label>
                    <Decide decisions={s.status === 'pending' ? ['approve', 'reject'] : s.status === 'approved' ? ['suspend'] : ['reinstate']} />
                  </form>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
