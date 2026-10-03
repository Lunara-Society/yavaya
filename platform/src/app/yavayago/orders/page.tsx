import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { money } from '@/ui/go/format';
import { customerOrders } from '@/server/domains/go/service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Everything this member ordered on YavayaGo. */
export default async function MyOrders() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login?next=/yavayago/orders');
  const orders = await customerOrders(db(), userId);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <div className="wrap go-page cm-column">
        <p>
          <Link href="/yavayago">← {t('go.back_to_stores')}</Link>
        </p>
        <h1>{t('go.orders.title')}</h1>
        {orders.length === 0 ? (
          <p className="muted">{t('go.orders.none')}</p>
        ) : (
          <ul className="go-order-list">
            {orders.map(({ order, storeName }) => (
              <li key={order.id}>
                <Link href={`/yavayago/orders/${order.id}`} className="go-order-row">
                  <span>
                    <strong>{storeName}</strong>
                    <span className="muted"> · #{order.code} · {when.format(order.placedAt)}</span>
                  </span>
                  <span className={`go-status s-${order.status}`}>{t(`go.status.${order.status}` as MessageKey)}</span>
                  <span>{money(order.totalMinor, order.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
