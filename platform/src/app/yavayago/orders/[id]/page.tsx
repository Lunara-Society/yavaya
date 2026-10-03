import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GoMap } from '@/ui/go/map';
import { Refresher } from '@/ui/go/client';
import { money, waLink } from '@/ui/go/format';
import { orderForCustomer } from '@/server/domains/go/service';
import { GO_RULES } from '@/config/business-rules';
import { customerCancelAction } from '../../actions';
import { mapLabels } from '../../labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = ['placed', 'accepted', 'ready', 'picked_up', 'delivered'] as const;

/** One order, for the person who placed it: where it is, who is bringing it, and what it costs. */
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(`/login?next=/yavayago/orders/${id}`);
  const found = await orderForCustomer(db(), userId, id);
  if (!found) notFound();
  const { order, store, driver } = found;
  const closed = order.status === 'delivered' || order.status === 'cancelled' || order.status === 'rejected';
  const reached = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const tracking = !closed && Boolean(driver);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {!closed ? <Refresher seconds={20} /> : null}
      <div className="wrap go-page cm-column">
        <p>
          <Link href="/yavayago/orders">← {t('go.orders.back')}</Link>
        </p>
        {query.placed ? (
          <p className="mk-banner" role="status">
            {t('go.order.placed_banner', { minutes: GO_RULES.storeAnswerMinutes })}
          </p>
        ) : null}
        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey)}
          </p>
        ) : null}
        <p className="eyebrow">{store.name}</p>
        <h1 className="go-order-title">
          {t(`go.status.${order.status}` as MessageKey)} <span className="go-code">#{order.code}</span>
        </h1>
        {order.closedReason && order.status !== 'delivered' ? <p className="muted">{t(`go.reason.${order.closedReason}` as MessageKey)}</p> : null}

        {order.status !== 'cancelled' && order.status !== 'rejected' ? (
          <ol className="go-steps">
            {STEPS.map((step, index) => (
              <li key={step} className={index <= reached ? 'done' : ''}>
                {t(`go.step.${step}` as MessageKey)}
              </li>
            ))}
          </ol>
        ) : null}

        {driver && !closed ? (
          <section className="go-driver-card">
            <img src={`/media/${driver.photoMediaId}`} alt={t('go.driver.photo_of', { name: driver.name })} />
            <div>
              <p className="eyebrow">{t('go.driver.your_driver')}</p>
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
              <p className="hint muted">{t('go.driver.check_hint', { code: order.code })}</p>
              <a className="btn btn-line" href={waLink(driver.whatsappE164, t('go.driver.wa_text', { code: order.code }))} target="_blank" rel="noopener noreferrer">
                {t('go.driver.whatsapp')}
              </a>
            </div>
          </section>
        ) : null}

        {tracking ? (
          <div className="go-track">
            <GoMap mode="track" orderId={order.id} pollSeconds={GO_RULES.trackingPollSeconds} driverPhoto={driver ? `/media/${driver.photoMediaId}` : null} labels={mapLabels(t)} />
          </div>
        ) : !closed ? (
          <p className="muted">{t('go.order.waiting_driver')}</p>
        ) : null}

        <section className="go-receipt">
          <h2 className="go-menu-h">{t('go.order.summary')}</h2>
          {order.lines.map((line) => (
            <p key={line.itemId} className="go-cart-line">
              <span>
                {line.quantity} × {line.name}
              </span>
              <span>{money(line.priceMinor * line.quantity, order.currency)}</span>
            </p>
          ))}
          <p className="go-cart-line muted">
            <span>{t('go.cart.delivery')}</span>
            <span>{money(order.deliveryFeeMinor, order.currency)}</span>
          </p>
          <p className="go-cart-line go-cart-total">
            <span>{t('go.cart.total')}</span>
            <span>{money(order.totalMinor, order.currency)}</span>
          </p>
          <p className="hint muted">
            {t('go.order.cash_note')}
            {order.payingWithMinor ? ` ${t('go.order.paying_with', { amount: money(order.payingWithMinor, order.currency) })}` : ''}
          </p>
          <p className="hint muted">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(order.placedAt)}</p>
        </section>

        {order.status === 'placed' ? (
          <form action={customerCancelAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn btn-line" type="submit">
              {t('go.order.cancel')}
            </button>
          </form>
        ) : null}
        <p>
          <a className="btn btn-line" href={waLink(store.whatsappE164, t('go.store.wa_text', { code: order.code }))} target="_blank" rel="noopener noreferrer">
            {t('go.store.whatsapp')}
          </a>
        </p>
      </div>
    </SiteShell>
  );
}
