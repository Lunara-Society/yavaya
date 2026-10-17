import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GoMap } from '@/ui/go/map';
import { Refresher } from '@/ui/go/client';
import { money, waLink } from '@/ui/go/format';
import { tripForCustomer } from '@/server/domains/go/trips';
import { siteUrl } from '@/server/seo';
import { cancelTripAction, chooseOfferAction } from '../actions';
import { mapLabels } from '../../labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = ['open', 'accepted', 'arrived', 'in_progress', 'completed'] as const;

/** One request, for the person who made it: offers to choose from, then the driver on the map. */
export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ requested?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(`/login?next=/yavayago/viajes/${id}`);
  const found = await tripForCustomer(db(), userId, id);
  if (!found) notFound();
  const { trip, offers, driver } = found;
  const closed = trip.status === 'completed' || trip.status === 'cancelled' || trip.status === 'expired';
  const active = trip.status === 'accepted' || trip.status === 'arrived' || trip.status === 'in_progress';
  const reached = STEPS.indexOf(trip.status as (typeof STEPS)[number]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const shareLink = `${siteUrl()}/yavayago/viajes/seguir/${trip.shareToken}`;
  const fare = trip.agreedFareMinor ?? trip.offeredFareMinor;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {!closed ? <Refresher seconds={trip.status === 'open' ? 10 : 20} /> : null}
      <div className="wrap go-page cm-column">
        <p>
          <Link href="/yavayago/viajes">← {t('go.trip.back')}</Link>
        </p>
        {query.requested ? (
          <p className="mk-banner" role="status">
            {t('go.trip.requested_banner')}
          </p>
        ) : null}
        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey)}
          </p>
        ) : null}
        <p className="eyebrow">{t(`go.trip.kind.${trip.kind}` as MessageKey)}</p>
        <h1 className="go-order-title">
          {t(`go.trip.status.${trip.status}` as MessageKey)} <span className="go-code">#{trip.code}</span>
        </h1>
        {trip.closedReason && trip.status !== 'completed' ? <p className="muted">{t(`go.trip.reason.${trip.closedReason}` as MessageKey)}</p> : null}

        {trip.status !== 'cancelled' && trip.status !== 'expired' ? (
          <ol className="go-steps">
            {STEPS.map((step, index) => (
              <li key={step} className={index <= reached ? 'done' : ''}>
                {t(`go.trip.step.${step}` as MessageKey)}
              </li>
            ))}
          </ol>
        ) : null}

        {trip.status === 'open' ? (
          <section>
            <h2 className="go-menu-h">{t('go.trip.offers_title')}</h2>
            <p className="muted">{t('go.trip.offers_lead', { fare: money(trip.offeredFareMinor, trip.currency), time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(trip.expiresAt) })}</p>
            {offers.length === 0 ? <p className="go-waiting">{t('go.trip.no_offers_yet')}</p> : null}
            <ul className="go-offers">
              {offers.map((offer) => (
                <li key={offer.id} className="go-offer">
                  <img src={`/media/${offer.driver.photoMediaId}`} alt={t('go.driver.photo_of', { name: offer.driver.name })} />
                  <div>
                    <strong>{offer.driver.name}</strong>
                    <p className="muted">
                      {t(`go.vehicle.${offer.driver.vehicleType}` as MessageKey)} · {offer.driver.vehicleDescription}
                      {offer.driver.plate ? (
                        <>
                          {' · '}
                          <span className="go-plate">{offer.driver.plate}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="go-offer-price">
                      <strong>{money(offer.fareMinor, trip.currency)}</strong> · {t('go.trip.eta', { minutes: offer.etaMinutes })}
                      {offer.fareMinor !== trip.offeredFareMinor ? <span className="go-counter"> {t('go.trip.counter')}</span> : null}
                    </p>
                  </div>
                  <form action={chooseOfferAction}>
                    <input type="hidden" name="tripId" value={trip.id} />
                    <input type="hidden" name="offerId" value={offer.id} />
                    <button className="btn btn-gold" type="submit">
                      {t('go.trip.choose')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {driver && active ? (
          <section className="go-driver-card">
            <img src={`/media/${driver.photoMediaId}`} alt={t('go.driver.photo_of', { name: driver.name })} />
            <div>
              <p className="eyebrow">{t('go.trip.your_driver')}</p>
              <strong>{driver.name}</strong>
              <p className="muted">
                {t(`go.vehicle.${driver.vehicleType}` as MessageKey)} · {driver.vehicleDescription}
                {driver.plate ? (
                  <>
                    {' · '}
                    <span className="go-plate">{driver.plate}</span>
                  </>
                ) : null}
              </p>
              <p className="hint muted">{t('go.trip.check_hint', { code: trip.code })}</p>
              <a className="btn btn-line" href={waLink(driver.whatsappE164, t('go.trip.wa_text', { code: trip.code }))} target="_blank" rel="noopener noreferrer">
                {t('go.trip.whatsapp_driver')}
              </a>
            </div>
          </section>
        ) : null}

        {active ? (
          <>
            <div className="go-track">
              <GoMap mode="track" orderId={trip.id} trackingUrl={`/api/go/trips/${trip.id}/tracking`} pollSeconds={GO_RULES.trackingPollSeconds} driverPhoto={driver ? `/media/${driver.photoMediaId}` : null} labels={mapLabels(t)} />
            </div>
            <section className="go-share">
              <h2 className="go-menu-h">{t('go.trip.share_title')}</h2>
              <p className="muted">{t('go.trip.share_lead')}</p>
              <p className="btn-row">
                <a className="btn btn-line" href={`https://wa.me/?text=${encodeURIComponent(t('go.trip.share_text', { link: shareLink }))}`} target="_blank" rel="noopener noreferrer">
                  {t('go.trip.share_button')}
                </a>
              </p>
            </section>
          </>
        ) : null}

        <section className="go-receipt">
          <h2 className="go-menu-h">{t('go.trip.summary')}</h2>
          {trip.description ? <p>{trip.description}</p> : null}
          {trip.distanceKm !== null ? <p className="muted">{t('go.trip.distance', { km: trip.distanceKm })}</p> : null}
          <p className="go-cart-line go-cart-total">
            <span>{trip.agreedFareMinor ? t('go.trip.agreed') : t('go.trip.your_price')}</span>
            <span>{money(fare, trip.currency)}</span>
          </p>
          {trip.purchaseBudgetMinor ? <p className="hint muted">{t('go.trip.budget_note', { amount: money(trip.purchaseBudgetMinor, trip.currency) })}</p> : null}
          <p className="hint muted">{trip.kind === 'errand' ? t('go.trip.cash_errand') : t('go.trip.cash')}</p>
        </section>

        {trip.status === 'open' || trip.status === 'accepted' || trip.status === 'arrived' ? (
          <form action={cancelTripAction}>
            <input type="hidden" name="tripId" value={trip.id} />
            <button className="btn btn-line" type="submit">
              {t('go.trip.cancel')}
            </button>
          </form>
        ) : null}
        {closed ? (
          <p>
            <Link className="btn btn-gold" href="/yavayago/viajes">
              {t('go.trip.new')}
            </Link>
          </p>
        ) : null}
      </div>
    </SiteShell>
  );
}
