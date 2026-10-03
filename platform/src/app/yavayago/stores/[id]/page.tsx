import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { StoreCart } from '@/ui/go/client';
import { GoMap } from '@/ui/go/map';
import { money, waLink } from '@/ui/go/format';
import { getStore, storeMenu } from '@/server/domains/go/service';
import { GO_RULES } from '@/config/business-rules';
import { placeOrderAction } from '../../actions';
import { mapLabels } from '../../labels';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const store = await getStore(db(), id);
  return store ? { title: `${store.name} · YavayaGo`, description: store.about.slice(0, 160) } : {};
}

/** A store and its menu. Ordering takes an account; looking does not. */
export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, language, theme, member, userId } = await siteContext();
  const store = await getStore(db(), id, userId);
  if (!store) notFound();
  const items = await storeMenu(db(), store.id);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const own = store.ownerUserId === userId;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <div className="wrap go-page">
        <p>
          <Link href="/yavayago">← {t('go.back_to_stores')}</Link>
        </p>
        <header className="go-store-head">
          {store.photoMediaId ? <img className="go-store-hero" src={`/media/${store.photoMediaId}`} alt="" /> : null}
          <div>
            <p className="eyebrow">
              {t(`go.category.${store.category}` as MessageKey)} · {store.placeName}
            </p>
            <h1>{store.name}</h1>
            <p className="lead">{store.about}</p>
            <p className="go-meta">
              <span className={`go-badge ${store.isOpen ? 'open' : 'shut'}`}>{store.isOpen ? t('go.store.open') : t('go.store.closed')}</span> {store.hours}
            </p>
            <p className="go-meta">
              {t('go.store.delivery_fee', { fee: money(store.deliveryFeeMinor, store.currency) })} · {t('go.store.prep', { minutes: store.prepMinutes })}
              {store.minimumOrderMinor > 0 ? ` · ${t('go.store.minimum', { amount: money(store.minimumOrderMinor, store.currency) })}` : ''}
            </p>
            <p className="go-meta muted">{store.address}</p>
            <p>
              <a className="btn btn-line" href={waLink(store.whatsappE164)} target="_blank" rel="noopener noreferrer">
                {t('go.store.whatsapp')}
              </a>
            </p>
          </div>
        </header>

        {own ? <p className="mk-banner">{t(store.status === 'approved' ? 'go.store.yours' : 'go.store.yours_pending')}</p> : null}
        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey, { maxKm: GO_RULES.maxDeliveryKm })}
          </p>
        ) : null}

        <div className="go-store-map">
          <GoMap mode="view" store={{ latitude: store.latitude, longitude: store.longitude }} labels={mapLabels(t)} />
        </div>

        {items.length === 0 ? (
          <p className="muted">{t('go.store.no_menu')}</p>
        ) : (
          <StoreCart
            items={items.map((item) => ({ id: item.id, section: item.section, name: item.name, description: item.description, priceMinor: item.priceMinor, photoMediaId: item.photoMediaId }))}
            currency={store.currency}
            deliveryFeeMinor={store.deliveryFeeMinor}
            minimumOrderMinor={store.minimumOrderMinor}
            storeId={store.id}
            start={{ latitude: store.latitude, longitude: store.longitude }}
            open={store.isOpen && store.status === 'approved' && !own}
            signedIn={Boolean(member)}
            action={placeOrderAction}
            labels={{
              add: t('go.cart.add'),
              remove: t('go.cart.remove'),
              cart: t('go.cart.title'),
              empty: t('go.cart.empty'),
              subtotal: t('go.cart.subtotal'),
              delivery: t('go.cart.delivery'),
              total: t('go.cart.total'),
              minimum: t('go.cart.minimum'),
              checkout: t('go.cart.checkout'),
              whereTitle: t('go.checkout.where'),
              directions: t('go.checkout.directions'),
              directionsHint: t('go.checkout.directions_hint'),
              whatsapp: t('go.checkout.whatsapp'),
              whatsappHint: t('go.checkout.whatsapp_hint'),
              payingWith: t('go.checkout.paying_with'),
              payingWithHint: t('go.checkout.paying_with_hint'),
              note: t('go.checkout.note'),
              cash: t('go.checkout.cash'),
              place: t('go.checkout.place'),
              signIn: t('go.checkout.sign_in'),
              closed: own ? t('go.cart.own_store') : t('go.cart.closed'),
              map: mapLabels(t),
            }}
          />
        )}
      </div>
    </SiteShell>
  );
}
