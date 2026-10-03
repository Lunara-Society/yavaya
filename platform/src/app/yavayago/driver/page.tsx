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
import { placeOptions } from '@/server/domains/mercadito/service';
import { availableOrders, driverCurrentOrder, myDriver } from '@/server/domains/go/service';
import { claimAction, deliveredAction, driverOnlineAction, pickedUpAction, releaseAction } from '../actions';
import { mapLabels } from '../labels';

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
  const [driver, countries] = await Promise.all([myDriver(db(), userId), placeOptions(db(), locale)]);
  const approved = driver?.status === 'approved';
  const [current, available] = await Promise.all([approved ? driverCurrentOrder(db(), userId) : Promise.resolve(null), approved && driver.online ? availableOrders(db(), userId) : Promise.resolve([])]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {approved && driver.online && !current ? <Refresher seconds={15} /> : null}
      {current ? <Refresher seconds={30} /> : null}
      <div className="wrap go-page cm-column">
        <p>
          <Link href="/yavayago">← {t('go.back_to_stores')}</Link>
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
                {!current ? (
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
              <dt>{t('go.driver.customer')}</dt>
              <dd>
                {current.customerName.split(' ')[0]}{' '}
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
        ) : approved && driver.online ? (
          <section>
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
                <select name="locationId" required defaultValue={driver?.locationId ?? ''}>
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {countries.map((country) => (
                    <optgroup key={country.code} label={country.name}>
                      {country.places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
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
