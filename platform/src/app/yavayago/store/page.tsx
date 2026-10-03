import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_CATEGORIES } from '@/config/go';
import { GO_RULES, MEDIA_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GoMap } from '@/ui/go/map';
import { Refresher } from '@/ui/go/client';
import { money, moneyInput, waLink } from '@/ui/go/format';
import { placeOptions } from '@/server/domains/mercadito/service';
import { cityPoints, mapStart, myStore, storeMenu, storeOrders } from '@/server/domains/go/service';
import { menuItemAvailableAction, menuItemRemoveAction, menuItemUpdateAction, storeAnswerAction, storeCancelAction, storeOpenAction, storeReadyAction } from '../actions';
import { mapLabels } from '../labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * For a store: apply, then take orders. New orders arrive at the top and the
 * page keeps itself current; the owner never sees where a customer lives —
 * only what they ordered and their first name.
 */
export default async function StoreDashboard({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; added?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login?next=/yavayago/store');
  const [store, countries, points] = await Promise.all([myStore(db(), userId), placeOptions(db(), locale), cityPoints(db())]);
  const [items, orders, start] = await Promise.all([
    store ? storeMenu(db(), store.id, { includeUnavailable: true }) : Promise.resolve([]),
    store ? storeOrders(db(), userId) : Promise.resolve([]),
    store ? Promise.resolve({ latitude: store.latitude, longitude: store.longitude }) : mapStart(db(), userId),
  ]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const when = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });
  const groups = {
    placed: orders.filter((o) => o.status === 'placed'),
    preparing: orders.filter((o) => o.status === 'accepted' || o.status === 'ready'),
    onTheWay: orders.filter((o) => o.status === 'picked_up'),
    finished: orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled' || o.status === 'rejected'),
  };

  const OrderCard = ({ order }: { order: (typeof orders)[number] }) => (
    <li className={`go-incoming s-${order.status}`}>
      <p className="go-incoming-head">
        <strong>#{order.code}</strong> · {order.customerFirstName} · {when.format(order.placedAt)}
        <span className={`go-status s-${order.status}`}>{t(`go.status.${order.status}` as MessageKey)}</span>
      </p>
      <ul className="go-lines">
        {order.lines.map((line) => (
          <li key={line.itemId}>
            {line.quantity} × {line.name}
          </li>
        ))}
      </ul>
      {order.note ? <p className="go-note">“{order.note}”</p> : null}
      <p className="go-cart-line">
        <span className="muted">{t('go.cart.total')}</span>
        <span>{money(order.totalMinor, order.currency)}</span>
      </p>
      {order.driver ? (
        <p className="go-assigned">
          <img src={`/media/${order.driver.photoMediaId}`} alt="" /> {t('go.store.driver_coming', { name: order.driver.name })}
          {order.driver.plate ? <span className="go-plate">{order.driver.plate}</span> : null}
        </p>
      ) : order.status === 'accepted' || order.status === 'ready' ? (
        <p className="muted">{t('go.store.no_driver_yet')}</p>
      ) : null}
      <div className="btn-row">
        {order.status === 'placed' ? (
          <>
            <form action={storeAnswerAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="accept" value="1" />
              <button className="btn btn-gold" type="submit">
                {t('go.store.accept')}
              </button>
            </form>
            <form action={storeAnswerAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="accept" value="0" />
              <button className="btn btn-line" type="submit">
                {t('go.store.decline')}
              </button>
            </form>
          </>
        ) : null}
        {order.status === 'accepted' ? (
          <form action={storeReadyAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn btn-gold" type="submit">
              {t('go.store.ready')}
            </button>
          </form>
        ) : null}
        {order.status === 'accepted' || order.status === 'ready' ? (
          <form action={storeCancelAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn btn-line" type="submit">
              {t('go.store.cancel')}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );

  const DetailsForm = () => (
    <form className="mk-form" method="post" action="/api/go/store" encType="multipart/form-data" id="details">
      <label>
        <span>{t('go.form.name')}</span>
        <input name="name" required minLength={2} maxLength={80} defaultValue={store?.name} />
      </label>
      <label>
        <span>{t('go.form.category')}</span>
        <select name="category" required defaultValue={store?.category ?? ''}>
          <option value="" disabled>
            {t('mercadito.form.choose')}
          </option>
          {GO_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`go.category.${key}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('go.form.about')}</span>
        <textarea name="about" required minLength={10} maxLength={600} defaultValue={store?.about} />
      </label>
      <label>
        <span>{t('go.form.city')}</span>
        <select name="locationId" required defaultValue={store?.locationId ?? ''}>
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
        <span>{t('go.form.address')}</span>
        <input name="address" required minLength={5} maxLength={300} defaultValue={store?.address} placeholder={t('go.form.address_hint')} />
      </label>
      <div>
        <span className="go-label">{t('go.form.map')}</span>
        <small className="hint muted">{t('go.form.map_hint')}</small>
        <GoMap mode="pick" initial={start} zoom={store ? 17 : 13} name="place" labels={mapLabels(t)} follow={{ select: 'locationId', points }} />
      </div>
      <label>
        <span>{t('go.form.whatsapp')}</span>
        <input name="whatsapp" type="tel" required defaultValue={store?.whatsappE164} placeholder="+505 8888 1234" />
      </label>
      <label>
        <span>{t('go.form.hours')}</span>
        <input name="hours" required minLength={3} maxLength={200} defaultValue={store?.hours} placeholder={t('go.form.hours_hint')} />
      </label>
      <div className="go-form-row">
        <label>
          <span>{t('go.form.delivery_fee')}</span>
          <input name="deliveryFee" required inputMode="decimal" defaultValue={store ? moneyInput(store.deliveryFeeMinor) : ''} />
        </label>
        <label>
          <span>{t('go.form.minimum')}</span>
          <input name="minimumOrder" inputMode="decimal" defaultValue={store ? moneyInput(store.minimumOrderMinor) : '0'} />
        </label>
        <label>
          <span>{t('go.form.prep')}</span>
          <input name="prepMinutes" type="number" min={5} max={180} required defaultValue={store?.prepMinutes ?? 20} />
        </label>
      </div>
      <p className="hint muted">{t('go.form.fee_hint')}</p>
      <label>
        <span>{t('go.form.photo')}</span>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
        <small className="hint muted">{t('go.form.photo_hint', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 })}</small>
      </label>
      <button className="btn btn-gold" type="submit">
        {store ? t('go.form.save') : t('go.form.apply')}
      </button>
    </form>
  );

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {store?.status === 'approved' ? <Refresher seconds={15} /> : null}
      <div className="wrap go-page">
        <p>
          <Link href="/yavayago">← {t('go.back_to_stores')}</Link>
        </p>
        <h1>{store ? store.name : t('go.store.apply_title')}</h1>
        {query.saved ? <p className="mk-banner" role="status">{t('go.store.saved')}</p> : null}
        {query.added ? <p className="mk-banner" role="status">{t('go.store.item_added')}</p> : null}
        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey, { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024, max: GO_RULES.menuMaxItems })}
          </p>
        ) : null}

        {!store ? (
          <div className="cm-column">
            <p className="lead">{t('go.store.apply_lead')}</p>
            <ul className="vt-list muted">
              <li>{t('go.store.apply_review')}</li>
              <li>{t('go.store.apply_money')}</li>
              <li>{t('go.store.apply_free')}</li>
            </ul>
            <DetailsForm />
          </div>
        ) : (
          <>
            <section className={`go-state s-${store.status}`}>
              <p>
                <strong>{t(`go.store.state.${store.status}` as MessageKey)}</strong>
              </p>
              {store.reviewNote && store.status !== 'approved' ? <p className="muted">{store.reviewNote}</p> : null}
              {store.status === 'approved' ? (
                <form action={storeOpenAction} className="go-open-toggle">
                  <input type="hidden" name="open" value={store.isOpen ? '0' : '1'} />
                  <span className={`go-badge ${store.isOpen ? 'open' : 'shut'}`}>{store.isOpen ? t('go.store.open') : t('go.store.closed')}</span>
                  <button className={store.isOpen ? 'btn btn-line' : 'btn btn-gold'} type="submit">
                    {store.isOpen ? t('go.store.close_now') : t('go.store.open_now')}
                  </button>
                  <Link href={`/yavayago/stores/${store.id}`}>{t('go.store.see_public')}</Link>
                </form>
              ) : null}
            </section>

            {store.status === 'approved' ? (
              <section className="go-board" aria-live="polite">
                <h2 className="go-menu-h">{t('go.store.orders')}</h2>
                {orders.length === 0 ? <p className="muted">{t('go.store.no_orders')}</p> : null}
                {groups.placed.length > 0 ? (
                  <>
                    <h3 className="go-sub">{t('go.store.new_orders', { count: groups.placed.length })}</h3>
                    <ul className="go-incoming-list">
                      {groups.placed.map((o) => (
                        <OrderCard key={o.id} order={o} />
                      ))}
                    </ul>
                  </>
                ) : null}
                {groups.preparing.length > 0 ? (
                  <>
                    <h3 className="go-sub">{t('go.store.preparing')}</h3>
                    <ul className="go-incoming-list">
                      {groups.preparing.map((o) => (
                        <OrderCard key={o.id} order={o} />
                      ))}
                    </ul>
                  </>
                ) : null}
                {groups.onTheWay.length > 0 ? (
                  <>
                    <h3 className="go-sub">{t('go.store.on_the_way')}</h3>
                    <ul className="go-incoming-list">
                      {groups.onTheWay.map((o) => (
                        <OrderCard key={o.id} order={o} />
                      ))}
                    </ul>
                  </>
                ) : null}
                {groups.finished.length > 0 ? (
                  <details>
                    <summary>{t('go.store.finished_today', { count: groups.finished.length })}</summary>
                    <ul className="go-incoming-list">
                      {groups.finished.map((o) => (
                        <OrderCard key={o.id} order={o} />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            ) : null}

            <section id="menu" className="go-board">
              <h2 className="go-menu-h">{t('go.store.menu')}</h2>
              <form className="mk-form go-add-item" method="post" action="/api/go/menu" encType="multipart/form-data">
                <div className="go-form-row">
                  <label>
                    <span>{t('go.menu.section')}</span>
                    <input name="section" required maxLength={40} placeholder={t('go.menu.section_hint')} list="go-sections" />
                  </label>
                  <label>
                    <span>{t('go.menu.name')}</span>
                    <input name="name" required minLength={2} maxLength={80} />
                  </label>
                  <label>
                    <span>{t('go.menu.price')}</span>
                    <input name="price" required inputMode="decimal" />
                  </label>
                </div>
                <datalist id="go-sections">
                  {[...new Set(items.map((i) => i.section))].map((section) => (
                    <option key={section} value={section} />
                  ))}
                </datalist>
                <label>
                  <span>{t('go.menu.description')}</span>
                  <input name="description" maxLength={300} />
                </label>
                <label>
                  <span>{t('go.menu.photo')}</span>
                  <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
                </label>
                <button className="btn btn-gold" type="submit">
                  {t('go.menu.add')}
                </button>
              </form>

              <ul className="go-menu-admin">
                {items.map((item) => (
                  <li key={item.id} className={item.available ? '' : 'off'}>
                    {item.photoMediaId ? <img src={`/media/${item.photoMediaId}`} alt="" /> : null}
                    <details>
                      <summary>
                        <strong>{item.name}</strong> <span className="muted">· {item.section}</span> <span className="go-price">{money(item.priceMinor, store.currency)}</span>
                        {!item.available ? <span className="go-badge shut">{t('go.menu.sold_out')}</span> : null}
                      </summary>
                      <form action={menuItemUpdateAction} className="mk-form">
                        <input type="hidden" name="itemId" value={item.id} />
                        <div className="go-form-row">
                          <label>
                            <span>{t('go.menu.section')}</span>
                            <input name="section" required maxLength={40} defaultValue={item.section} />
                          </label>
                          <label>
                            <span>{t('go.menu.name')}</span>
                            <input name="name" required maxLength={80} defaultValue={item.name} />
                          </label>
                          <label>
                            <span>{t('go.menu.price')}</span>
                            <input name="price" required inputMode="decimal" defaultValue={moneyInput(item.priceMinor)} />
                          </label>
                        </div>
                        <label>
                          <span>{t('go.menu.description')}</span>
                          <input name="description" maxLength={300} defaultValue={item.description} />
                        </label>
                        <button className="btn btn-line" type="submit">
                          {t('go.form.save')}
                        </button>
                      </form>
                    </details>
                    <div className="btn-row">
                      <form action={menuItemAvailableAction}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="available" value={item.available ? '0' : '1'} />
                        <button className="vt-link" type="submit">
                          {item.available ? t('go.menu.mark_sold_out') : t('go.menu.mark_available')}
                        </button>
                      </form>
                      <form action={menuItemRemoveAction}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <button className="vt-link" type="submit">
                          {t('go.menu.remove')}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="go-board">
              <details>
                <summary>
                  <strong>{t('go.store.edit_details')}</strong>
                </summary>
                <DetailsForm />
              </details>
              <p className="hint muted">
                {t('go.store.your_whatsapp')} <a href={waLink(store.whatsappE164)}>{store.whatsappE164}</a>
              </p>
            </section>
          </>
        )}
      </div>
    </SiteShell>
  );
}
