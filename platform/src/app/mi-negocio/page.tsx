import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { boardPosts, users } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { signInPath } from '@/server/auth/sign-in-path';
import { myStore } from '@/server/domains/go/service';
import { businessAvailable, businessSummary, periodOf } from '@/server/domains/roxi/business';
import { memberClock } from '@/server/domains/roxi/world';
import { openListingCount } from '@/server/domains/mercadito/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { ShareOnWhatsApp } from '@/ui/site/share-whatsapp';
import { BOARD_DISTRICTS, BOARD_DISTRICT_KEYS, type BoardDistrict } from '@/config/boards';
import '../boards.css';
import './negocio.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('negocio.title'), robots: { index: false } };
}

/**
 * "Mi negocio": one page for a member who sells, joining what already exists
 * across Yavaya rather than adding another tool — their store and its link to
 * pass on, today's accounts from the ledger Roxi keeps, what they have
 * published, and their card. Every figure is read from the database as it is;
 * a section whose part of Yavaya the member has not used says how to start.
 */
export default async function MyBusinessPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  const ledger = businessAvailable();
  const { today } = await memberClock(db(), userId);
  const [store, totals, listings, posts, [me]] = await Promise.all([
    myStore(db(), userId),
    ledger ? businessSummary(db(), userId, periodOf(today, 'day')) : [],
    openListingCount(db(), userId),
    db()
      .select({ district: boardPosts.district, n: sql<number>`count(*)::int` })
      .from(boardPosts)
      .where(and(eq(boardPosts.authorUserId, userId), eq(boardPosts.status, 'open'), gt(boardPosts.expiresAt, sql`now()`)))
      .groupBy(boardPosts.district),
    db().select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const base = serverEnv().APP_URL.replace(/\/+$/, '');
  const storeUrl = store ? `${base}/yavayago/stores/${store.id}` : null;
  // Our own data, drawn by the qrcode library: an SVG with no script.
  const qr = storeUrl && store?.status === 'approved' ? await QRCode.toString(storeUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1526', light: '#ffffff' } }) : null;
  const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const postCount = new Map(posts.map((row) => [row.district, row.n]));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <p className="eyebrow">
            <Link href="/account">{t('nav.member_area')}</Link>
          </p>
          <h1>{t('negocio.title')}</h1>
          <p className="lead mb0">{t('negocio.lead')}</p>
        </div>
      </section>

      <div className="wrap ng-grid">
        <section className="card ng-card">
          <h2 className="h-sm">{t('negocio.store.title')}</h2>
          {store ? (
            <>
              <p>
                <strong>{store.name}</strong> · {t(`negocio.store.status.${store.status}` as MessageKey)}
              </p>
              {store.status === 'approved' && storeUrl ? (
                <>
                  <p className="muted">{t('negocio.store.share_lead')}</p>
                  {qr ? <div className="ng-qr" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
                  <p className="ng-url">{storeUrl.replace(/^https?:\/\//, '')}</p>
                  <div className="btn-row">
                    <ShareOnWhatsApp label={t('share.whatsapp')} text={t('share.store', { name: store.name, url: storeUrl })} />
                    <Link className="btn btn-line" href={`/yavayago/stores/${store.id}`}>
                      {t('negocio.store.see')}
                    </Link>
                  </div>
                </>
              ) : (
                <p className="muted">{t('negocio.store.waiting')}</p>
              )}
              <p className="mt">
                <Link className="btn btn-gold" href="/yavayago/store">
                  {t('negocio.store.manage')}
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="muted">{t('negocio.store.none')}</p>
              <Link className="btn btn-gold" href="/yavayago/store">
                {t('negocio.store.open')}
              </Link>
            </>
          )}
        </section>

        <section className="card ng-card">
          <h2 className="h-sm">{t('negocio.ledger.title')}</h2>
          {!ledger ? (
            <p className="muted">{t('negocio.ledger.unavailable')}</p>
          ) : totals.length === 0 ? (
            <p className="muted">{t('negocio.ledger.none')}</p>
          ) : (
            totals.map((row) => (
              <dl key={row.currency} className="ng-ledger">
                <dt>{t('roxi.business.sales')}</dt>
                <dd>{money(row.sales, row.currency)}</dd>
                <dt>{t('roxi.business.expenses')}</dt>
                <dd>{money(row.expenses + row.stockBought, row.currency)}</dd>
                {row.owedToMe > 0 ? (
                  <>
                    <dt>{t('roxi.business.owed_to_me')}</dt>
                    <dd>{money(row.owedToMe, row.currency)}</dd>
                  </>
                ) : null}
              </dl>
            ))
          )}
          {ledger ? (
            <p className="mt">
              <Link className="btn btn-line" href="/roxi/negocio">
                {t('negocio.ledger.open')}
              </Link>
            </p>
          ) : null}
        </section>

        <section className="card ng-card">
          <h2 className="h-sm">{t('negocio.posts.title')}</h2>
          <ul className="ng-links">
            <li>
              <Link href="/mercadito/mine">{t('district.mercadito.name')}</Link>
              <span>{t('negocio.posts.open', { count: listings })}</span>
            </li>
            {BOARD_DISTRICT_KEYS.map((key: BoardDistrict) => (
              <li key={key}>
                <Link href={`/${BOARD_DISTRICTS[key].slug}?mine=1`}>{t(`district.${key}.name` as MessageKey)}</Link>
                <span>{t('negocio.posts.open', { count: postCount.get(key) ?? 0 })}</span>
              </li>
            ))}
          </ul>
          <p className="mt">
            <Link className="btn btn-line" href="/negocios/new">
              {t('negocio.posts.publish')}
            </Link>
          </p>
        </section>

        <section className="card ng-card">
          <h2 className="h-sm">{t('negocio.card.title')}</h2>
          <p className="muted">{t('negocio.card.lead')}</p>
          {me ? (
            <Link className="btn btn-line" href={`/members/${formatYayId(me.yayId)}/tarjeta`}>
              {t('card.open')}
            </Link>
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
