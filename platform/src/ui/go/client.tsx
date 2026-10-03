'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoMap } from './map';
import { money } from './format';

/** Refreshes a dashboard while it is on screen, but never while someone is typing. */
export function Refresher({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const active = document.activeElement;
      if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) && active.form) return;
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}

export type CartItem = { id: string; section: string; name: string; description: string; priceMinor: number; photoMediaId: string | null };

type CartLabels = Record<
  | 'add'
  | 'remove'
  | 'cart'
  | 'empty'
  | 'subtotal'
  | 'delivery'
  | 'total'
  | 'minimum'
  | 'checkout'
  | 'whereTitle'
  | 'directions'
  | 'directionsHint'
  | 'whatsapp'
  | 'whatsappHint'
  | 'payingWith'
  | 'payingWithHint'
  | 'note'
  | 'cash'
  | 'place'
  | 'signIn'
  | 'closed',
  string
> & { map: Record<string, string> };

/**
 * The menu with its cart, and the checkout. The cart is only ids and
 * quantities; the server recomputes every price from the menu.
 */
export function StoreCart({
  items,
  currency,
  deliveryFeeMinor,
  minimumOrderMinor,
  storeId,
  start,
  open,
  signedIn,
  labels,
  action,
}: {
  items: CartItem[];
  currency: string;
  deliveryFeeMinor: number;
  minimumOrderMinor: number;
  storeId: string;
  start: { latitude: number; longitude: number };
  open: boolean;
  signedIn: boolean;
  labels: CartLabels;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [checkingOut, setCheckingOut] = useState(false);
  const sections = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) map.set(item.section, [...(map.get(item.section) ?? []), item]);
    return [...map.entries()];
  }, [items]);
  const lines = Object.entries(quantities).filter(([, q]) => q > 0);
  const subtotal = lines.reduce((sum, [id, q]) => sum + (items.find((i) => i.id === id)?.priceMinor ?? 0) * q, 0);
  const count = lines.reduce((sum, [, q]) => sum + q, 0);
  const belowMinimum = subtotal < minimumOrderMinor;
  const change = (id: string, delta: number) => setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(20, (current[id] ?? 0) + delta)) }));

  return (
    <div className="go-store-body">
      <div className="go-menu">
        {sections.map(([section, list]) => (
          <section key={section} className="go-menu-section">
            <h2 className="go-menu-h">{section}</h2>
            <ul className="go-items">
              {list.map((item) => {
                const q = quantities[item.id] ?? 0;
                return (
                  <li key={item.id} className={`go-item${q > 0 ? ' in-cart' : ''}`}>
                    {item.photoMediaId ? <img className="go-item-photo" src={`/media/${item.photoMediaId}`} alt="" loading="lazy" /> : null}
                    <div className="go-item-text">
                      <strong>{item.name}</strong>
                      {item.description ? <span className="muted">{item.description}</span> : null}
                      <span className="go-price">{money(item.priceMinor, currency)}</span>
                    </div>
                    {open ? (
                      <div className="go-qty">
                        {q > 0 ? (
                          <>
                            <button type="button" className="go-qty-btn" onClick={() => change(item.id, -1)} aria-label={`${labels.remove}: ${item.name}`}>
                              −
                            </button>
                            <span aria-live="polite">{q}</span>
                          </>
                        ) : null}
                        <button type="button" className="go-qty-btn add" onClick={() => change(item.id, 1)} aria-label={`${labels.add}: ${item.name}`}>
                          +
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="go-cart" aria-label={labels.cart}>
        <h2 className="go-menu-h">{labels.cart}</h2>
        {!open ? <p className="muted">{labels.closed}</p> : count === 0 ? <p className="muted">{labels.empty}</p> : null}
        {lines.map(([id, q]) => {
          const item = items.find((i) => i.id === id);
          if (!item) return null;
          return (
            <p key={id} className="go-cart-line">
              <span>
                {q} × {item.name}
              </span>
              <span>{money(item.priceMinor * q, currency)}</span>
            </p>
          );
        })}
        {count > 0 ? (
          <>
            <p className="go-cart-line muted">
              <span>{labels.subtotal}</span>
              <span>{money(subtotal, currency)}</span>
            </p>
            <p className="go-cart-line muted">
              <span>{labels.delivery}</span>
              <span>{money(deliveryFeeMinor, currency)}</span>
            </p>
            <p className="go-cart-line go-cart-total">
              <span>{labels.total}</span>
              <span>{money(subtotal + deliveryFeeMinor, currency)}</span>
            </p>
            {belowMinimum ? <p className="go-warn">{labels.minimum.replace('{amount}', money(minimumOrderMinor, currency))}</p> : null}
            <p className="hint muted">{labels.cash}</p>
            {!signedIn ? (
              <a className="btn btn-gold go-wide" href={`/login?next=/yavayago/stores/${storeId}`}>
                {labels.signIn}
              </a>
            ) : !checkingOut ? (
              <button type="button" className="btn btn-gold go-wide" disabled={belowMinimum} onClick={() => setCheckingOut(true)}>
                {labels.checkout}
              </button>
            ) : null}
          </>
        ) : null}
      </aside>

      {checkingOut && count > 0 ? (
        <form action={action} className="mk-form go-checkout" id="checkout">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="lines" value={JSON.stringify(lines.map(([itemId, quantity]) => ({ itemId, quantity })))} />
          <h2 className="go-menu-h">{labels.whereTitle}</h2>
          <GoMap mode="pick" initial={start} zoom={15} name="dropoff" labels={labels.map} />
          <label>
            <span>{labels.directions}</span>
            <textarea name="directions" required minLength={5} maxLength={300} placeholder={labels.directionsHint} />
          </label>
          <label>
            <span>{labels.whatsapp}</span>
            <input name="whatsapp" type="tel" required inputMode="tel" placeholder="+505 8888 1234" />
            <small className="hint muted">{labels.whatsappHint}</small>
          </label>
          <label>
            <span>{labels.payingWith}</span>
            <input name="payingWith" inputMode="decimal" placeholder={money(subtotal + deliveryFeeMinor, currency)} />
            <small className="hint muted">{labels.payingWithHint}</small>
          </label>
          <label>
            <span>{labels.note}</span>
            <input name="note" maxLength={300} />
          </label>
          <button type="submit" className="btn btn-gold go-wide">
            {labels.place} · {money(subtotal + deliveryFeeMinor, currency)}
          </button>
        </form>
      ) : null}
    </div>
  );
}
