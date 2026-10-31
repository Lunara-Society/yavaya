import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_VEHICLES } from '@/config/go';
import { GO_RULES, MEDIA_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GoMap } from '@/ui/go/map';
import { Refresher } from '@/ui/go/client';
import { money, waLink } from '@/ui/go/format';
import { availableOrders, driverCurrentOrder, myDriver } from '@/server/domains/go/service';
import { availableTrips, driverCurrentTrip } from '@/server/domains/go/trips';
import { arrivedAction, completeTripAction, dropTripAction, offerTripAction, startTripAction, withdrawOfferAction } from '../viajes/actions';
import { moneyInput } from '@/ui/go/format';
import { claimAction, deliveredAction, driverOnlineAction, pickedUpAction, releaseAction } from '../actions';
import { mapLabels } from '../labels';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * For drivers: apply, go online, take an order, and bring it. While an order
 * is theirs, this page shares the phone's position with that one customer —
 * and stops the moment the order ends or the page is closed.
 */
export default async function DriverPage({ searchParams }: { searchParams: Promise<{ error?: string; applied?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login?next=/yavayago/driver');
  const driver = await myDriver(db(), userId);
  const approved = driver?.status === 'approved';
  const [current, available, currentTrip, trips] = await Promise.all([
    approved ? driverCurrentOrder(db(), userId) : Promise.resolve(null),
    approved && driver.online ? availableOrders(db(), userId) : Promise.resolve([]),
    approved ? driverCurrentTrip(db(), userId) : Promise.resolve(null),
    approved && driver.online ? availableTrips(db(), userId) : Promise.resolve([]),
  ]);
  const busy = Boolean(current || currentTrip);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {approved && driver.online && !busy ? <Refresher seconds={15} /> : null}
      {busy ? <Refresher seconds={30} /> : null}
      <div className="wrap go-page cm-column">
        <p className="go-crumbs">
          <Link href="/yavayago">← {t('go.back_to_stores')}</Link>
          <Link href="/yavayago/mapa" className="go-live-link">
            {t('go.live.link')}
          </Link>
        </p>
        <h1>{t('go.driver.title')}</h1>
        {query.applied ? <p className="mk-banner" role="status">{t('go.driver.applied')}</p> : null}
        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey, { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 })}
          </p>
        ) : null}

        {driver ? (
          <section className={`go-state s-${driver.status}`}>
            <p>
              <strong>{t(`go.driver.state.${driver.status}` as MessageKey)}</strong>
            </p>
            {driver.reviewNote && driver.status !== 'approved' ? <p className="muted">{driver.reviewNote}</p> : null}
            {approved ? (
              <form action={driverOnlineAction} className="go-open-toggle">
                <input type="hidden" name="online" value={driver.online ? '0' : '1'} />
                <span className={`go-badge ${driver.online ? 'open' : 'shut'}`}>{driver.online ? t('go.driver.online') : t('go.driver.offline')}</span>
                {!busy ? (
                  <button className={driver.online ? 'btn btn-line' : 'btn btn-gold'} type="submit">
                    {driver.online ? t('go.driver.go_offline') : t('go.driver.go_online')}
                  </button>
                ) : null}
              </form>
            ) : null}
          </section>
        ) : null}

        {current ? (
          <section className="go-current">
            <p className="eyebrow">{t('go.driver.current')}</p>
            <h2>
              {current.store.name} <span className="go-code">#{current.order.code}</span>
            </h2>
            <p className={`go-status s-${current.order.status}`}>{t(`go.status.${current.order.status}` as MessageKey)}</p>
            <div className="go-track">
              <GoMap
                mode="drive"
                orderId={current.order.id}
                store={{ latitude: current.store.latitude, longitude: current.store.longitude }}
                dropoff={current.order.dropoffLatitude !== null && current.order.dropoffLongitude !== null ? { latitude: current.order.dropoffLatitude, longitude: current.order.dropoffLongitude } : null}
                minIntervalSeconds={GO_RULES.trackingMinIntervalSeconds + 1}
                labels={mapLabels(t)}
              />
            </div>
            <p className="hint muted">{t('go.driver.sharing_note')}</p>
            <dl className="go-facts">
              <dt>{t('go.driver.pickup')}</dt>
              <dd>
                {current.store.address}{' '}
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${current.store.latitude},${current.store.longitude}`} target="_blank" rel="noopener noreferrer">
                  {t('go.driver.directions')}
                </a>
              </dd>
              <dt>{t('go.driver.dropoff')}</dt>
              <dd>
                {current.order.dropoffDirections}{' '}
                {current.order.dropoffLatitude !== null ? (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${current.order.dropoffLatitude},${current.order.dropoffLongitude}`} target="_blank" rel="noopener noreferrer">
                    {t('go.driver.directions')}
                  </a>
                ) : null}
              </dd>
              <dt>{current.order.recipientName ? t('go.driver.recipient') : t('go.driver.customer')}</dt>
              <dd>
                {current.order.recipientName ? t('go.driver.recipient_for', { name: current.order.recipientName, from: current.customerName.split(' ')[0] ?? '' }) : current.customerName.split(' ')[0]}{' '}
                {current.order.customerWhatsappE164 ? (
                  <a href={waLink(current.order.customerWhatsappE164, t('go.driver.wa_customer', { code: current.order.code }))} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                ) : null}
              </dd>
              <dt>{t('go.driver.collect')}</dt>
              <dd>
                <strong>{money(current.order.totalMinor, current.order.currency)}</strong>
                {current.order.payingWithMinor ? ` · ${t('go.driver.change_for', { amount: money(current.order.payingWithMinor, current.order.currency), change: money(current.order.payingWithMinor - current.order.totalMinor, current.order.currency) })}` : ''}
              </dd>
            </dl>
            <ul className="go-lines">
              {current.order.lines.map((line) => (
                <li key={line.itemId}>
                  {line.quantity} × {line.name}
                </li>
              ))}
            </ul>
            <div className="btn-row">
              {current.order.status !== 'picked_up' ? (
                <>
                  <form action={pickedUpAction}>
                    <input type="hidden" name="orderId" value={current.order.id} />
                    <button className="btn btn-gold" type="submit">
                      {t('go.driver.picked_up')}
                    </button>
                  </form>
                  <form action={releaseAction}>
                    <input type="hidden" name="orderId" value={current.order.id} />
                    <button className="btn btn-line" type="submit">
                      {t('go.driver.release')}
                    </button>
                  </form>
                </>
              ) : (
                <form action={deliveredAction}>
                  <input type="hidden" name="orderId" value={current.order.id} />
                  <button className="btn btn-gold" type="submit">
                    {t('go.driver.delivered')}
                  </button>
                </form>
              )}
            </div>
          </section>
        ) : currentTrip ? (
          <section className="go-current">
            <p className="eyebrow">{t('go.trip.driver_current')}</p>
            <h2>
              {t(`go.trip.kind.${currentTrip.trip.kind}` as MessageKey)} <span className="go-code">#{currentTrip.trip.code}</span>
            </h2>
            <p className={`go-status s-${currentTrip.trip.status}`}>{t(`go.trip.status.${currentTrip.trip.status}` as MessageKey)}</p>
            {currentTrip.trip.pickupLatitude !== null && currentTrip.trip.pickupLongitude !== null ? (
              <div className="go-track">
                <GoMap
                  mode="drive"
                  orderId={currentTrip.trip.id}
                  positionUrl="/api/go/trips/position"
                  idField="tripId"
                  store={{ latitude: currentTrip.trip.pickupLatitude, longitude: currentTrip.trip.pickupLongitude }}
                  dropoff={currentTrip.trip.dropoffLatitude !== null && currentTrip.trip.dropoffLongitude !== null ? { latitude: currentTrip.trip.dropoffLatitude, longitude: currentTrip.trip.dropoffLongitude } : null}
                  minIntervalSeconds={GO_RULES.trackingMinIntervalSeconds + 1}
                  labels={mapLabels(t)}
                />
              </div>
            ) : null}
            <p className="hint muted">{t('go.trip.driver_sharing_note')}</p>
            <dl className="go-facts">
              {currentTrip.trip.description ? (
                <>
                  <dt>{t('go.trip.what')}</dt>
                  <dd>{currentTrip.trip.description}</dd>
                </>
              ) : null}
              <dt>{t('go.trip.pickup_at')}</dt>
              <dd>
                {currentTrip.trip.pickupDirections}{' '}
                {currentTrip.trip.pickupLatitude !== null ? (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${currentTrip.trip.pickupLatitude},${currentTrip.trip.pickupLongitude}`} target="_blank" rel="noopener noreferrer">
                    {t('go.driver.directions')}
                  </a>
                ) : null}
              </dd>
              {currentTrip.trip.dropoffDirections ? (
                <>
                  <dt>{t('go.trip.dropoff_at')}</dt>
                  <dd>
                    {currentTrip.trip.dropoffDirections}{' '}
                    {currentTrip.trip.dropoffLatitude !== null ? (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${currentTrip.trip.dropoffLatitude},${currentTrip.trip.dropoffLongitude}`} target="_blank" rel="noopener noreferrer">
                        {t('go.driver.directions')}
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}
              <dt>{t('go.driver.customer')}</dt>
              <dd>
                {currentTrip.customerName.split(' ')[0]}{' '}
                {currentTrip.trip.customerWhatsappE164 ? (
                  <a href={waLink(currentTrip.trip.customerWhatsappE164, t('go.trip.wa_customer', { code: currentTrip.trip.code }))} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                ) : null}
              </dd>
              <dt>{t('go.driver.collect')}</dt>
              <dd>
                <strong>{money(currentTrip.trip.agreedFareMinor ?? currentTrip.trip.offeredFareMinor, currentTrip.trip.currency)}</strong>
                {currentTrip.trip.purchaseBudgetMinor ? ` · ${t('go.trip.plus_purchase', { amount: money(currentTrip.trip.purchaseBudgetMinor, currentTrip.trip.currency) })}` : ''}
              </dd>
            </dl>
            <div className="btn-row">
              {currentTrip.trip.status === 'accepted' ? (
                <form action={arrivedAction}>
                  <input type="hidden" name="tripId" value={currentTrip.trip.id} />
                  <button className="btn btn-gold" type="submit">
                    {t('go.trip.arrived')}
                  </button>
                </form>
              ) : null}
              {currentTrip.trip.status === 'accepted' || currentTrip.trip.status === 'arrived' ? (
                <>
                  <form action={startTripAction}>
                    <input type="hidden" name="tripId" value={currentTrip.trip.id} />
                    <button className={currentTrip.trip.status === 'arrived' ? 'btn btn-gold' : 'btn btn-line'} type="submit">
                      {t('go.trip.start')}
                    </button>
                  </form>
                  <form action={dropTripAction}>
                    <input type="hidden" name="tripId" value={currentTrip.trip.id} />
                    <button className="btn btn-line" type="submit">
                      {t('go.trip.drop')}
                    </button>
                  </form>
                </>
              ) : null}
              {currentTrip.trip.status === 'in_progress' ? (
                <form action={completeTripAction}>
                  <input type="hidden" name="tripId" value={currentTrip.trip.id} />
                  <button className="btn btn-gold" type="submit">
                    {t('go.trip.complete')}
                  </button>
                </form>
              ) : null}
            </div>
          </section>
        ) : approved && driver.online ? (
          <section>
            <h2 className="go-menu-h">{t('go.trip.driver_available')}</h2>
            {trips.length === 0 ? <p className="muted">{t('go.trip.driver_none')}</p> : null}
            <ul className="go-incoming-list">
              {trips.map((trip) => (
                <li key={trip.id} className="go-incoming go-trip-request">
                  <p className="go-incoming-head">
                    <strong>{t(`go.trip.kind.${trip.kind}` as MessageKey)}</strong>
                    <span className="go-code">#{trip.code}</span>
                  </p>
                  {trip.description ? <p>{trip.description}</p> : null}
                  <p className="muted">
                    {trip.distanceKm !== null ? t('go.trip.distance', { km: trip.distanceKm }) : t('go.trip.one_place')}
                    {trip.kind === 'ride' ? ` · ${t('go.trip.riders', { count: trip.passengers })}` : ''}
                    {trip.area ? (
                      <>
                        {' · '}
                        <a href={`https://www.google.com/maps/search/?api=1&query=${trip.area.latitude},${trip.area.longitude}`} target="_blank" rel="noopener noreferrer">
                          {t('go.trip.area')}
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p>
                    {t('go.trip.they_offer', { fare: money(trip.offeredFareMinor, trip.currency) })}
                    {trip.purchaseBudgetMinor ? ` · ${t('go.trip.budget_for_driver', { amount: money(trip.purchaseBudgetMinor, trip.currency) })}` : ''}
                  </p>
                  {trip.myOffer && trip.myOffer.status === 'pending' ? (
                    <div className="btn-row">
                      <p className="go-waiting">{t('go.trip.you_offered', { fare: money(trip.myOffer.fareMinor, trip.currency), minutes: trip.myOffer.etaMinutes })}</p>
                      <form action={withdrawOfferAction}>
                        <input type="hidden" name="tripId" value={trip.id} />
                        <button className="btn btn-line" type="submit">
                          {t('go.trip.withdraw')}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={offerTripAction} className="go-offer-form">
                      <input type="hidden" name="tripId" value={trip.id} />
                      <label>
                        <span>{t('go.trip.your_fare')}</span>
                        <input name="fare" inputMode="decimal" required defaultValue={moneyInput(trip.offeredFareMinor)} />
                      </label>
                      <label>
                        <span>{t('go.trip.your_eta')}</span>
                        <select name="eta" defaultValue="10">
                          {[3, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                            <option key={m} value={m}>
                              {t('go.trip.minutes', { minutes: m })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="btn btn-gold" type="submit">
                        {t('go.trip.send_offer')}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>

            <h2 className="go-menu-h">{t('go.driver.available')}</h2>
            {available.length === 0 ? <p className="muted">{t('go.driver.none_available')}</p> : null}
            <ul className="go-incoming-list">
              {available.map((order) => (
                <li key={order.id} className="go-incoming">
                  <p className="go-incoming-head">
                    <strong>{order.storeName}</strong>
                    <span className={`go-status s-${order.status}`}>{t(`go.status.${order.status}` as MessageKey)}</span>
                  </p>
                  <p className="muted">{order.storeAddress}</p>
                  <p>
                    {t('go.driver.offer', { items: order.itemCount, km: order.distanceKm ?? '?', fee: money(order.deliveryFeeMinor, order.currency), total: money(order.totalMinor, order.currency) })}
                  </p>
                  <form action={claimAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="btn btn-gold" type="submit">
                      {t('go.driver.take')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!driver || driver.status === 'rejected' ? (
          <section id="apply">
            <p className="lead">{t('go.driver.apply_lead')}</p>
            <ul className="vt-list muted">
              <li>{t('go.driver.req_identity')}</li>
              <li>{t('go.driver.req_photo')}</li>
              <li>{t('go.driver.req_vehicle')}</li>
              <li>{t('go.driver.req_phone')}</li>
              <li>{t('go.driver.req_money')}</li>
            </ul>
            <form className="mk-form" method="post" action="/api/go/driver" encType="multipart/form-data">
              <label>
                <span>{t('go.driver.vehicle')}</span>
                <select name="vehicleType" required defaultValue={driver?.vehicleType ?? ''}>
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {GO_VEHICLES.map((key) => (
                    <option key={key} value={key}>
                      {t(`go.vehicle.${key}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('go.driver.vehicle_description')}</span>
                <input name="vehicleDescription" required minLength={3} maxLength={80} defaultValue={driver?.vehicleDescription} placeholder={t('go.driver.vehicle_hint')} />
              </label>
              <label>
                <span>{t('go.driver.plate')}</span>
                <input name="plate" maxLength={16} defaultValue={driver?.plate ?? ''} />
                <small className="hint muted">{t('go.driver.plate_hint')}</small>
              </label>
              <label>
                <span>{t('go.form.city')}</span>
                <PlacePicker name="locationId" labels={placePickerLabels(t)} initial={driver?.locationId} required />
              </label>
              <label>
                <span>{t('go.form.whatsapp')}</span>
                <input name="whatsapp" type="tel" required defaultValue={driver?.whatsappE164} placeholder="+505 8888 1234" />
                <small className="hint muted">{t('go.driver.whatsapp_hint')}</small>
              </label>
              <label>
                <span>{t('go.driver.photo')}</span>
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="user" required={!driver} />
                <small className="hint muted">{t('go.driver.photo_hint')}</small>
              </label>
              <label>
                <span>{t('go.driver.document')}</span>
                <input name="document" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required={!driver} />
                <small className="hint muted">{t('go.driver.document_hint')}</small>
              </label>
              <label className="go-check">
                <input type="checkbox" name="consent" required /> {t('go.driver.consent')}
              </label>
              <button className="btn btn-gold" type="submit">
                {t('go.driver.apply')}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
