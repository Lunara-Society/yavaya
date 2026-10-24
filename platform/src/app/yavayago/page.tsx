import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_CATEGORIES } from '@/config/go';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { DistrictScene } from '@/ui/site/art';
import { Icon, type IconName } from '@/ui/site/icons';
import { money } from '@/ui/go/format';
import { browseStores, myDriver, myStore } from '@/server/domains/go/service';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { Rotulo } from '@/ui/site/rotulo';
import { ANY_PLACE, browsePlace } from '@/server/place-choice';
import { subtreeIds } from '@/server/domains/geography/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.yavayago.title, description: c.pages.yavayago.description };
}

const CATEGORY_ICON: Record<(typeof GO_CATEGORIES)[number], IconName> = {
  food: 'food',
  groceries: 'basket',
  pharmacy: 'medical',
  bakery: 'bread',
  drinks: 'cup',
  essentials: 'house',
  local: 'store',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YavayaGo: stores near you that deliver, by drivers Yavaya checked. Public to browse. */
export default async function YavayaGo({ searchParams }: { searchParams: Promise<{ city?: string; place?: string; category?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  // `city` (a location id) is what older links carry; `place` is any town, department or country.
  const city = query.city && UUID.test(query.city) ? query.city : null;
  const { code: place, link: placeLink } = city ? { code: undefined, link: undefined } : await browsePlace(query.place, locale);
  const locationIds = city ? [city] : place ? await subtreeIds(db(), place) : null;
  const category = (GO_CATEGORIES as readonly string[]).includes(query.category ?? '') ? query.category! : null;
  const [stores, store, driver] = await Promise.all([
    browseStores(db(), { locationIds, category }),
    userId ? myStore(db(), userId) : Promise.resolve(null),
    userId ? myDriver(db(), userId) : Promise.resolve(null),
  ]);
  const link = (nextCategory: string | null) => {
    const search = new URLSearchParams();
    if (city) search.set('city', city);
    if (placeLink) search.set('place', placeLink);
    if (nextCategory) search.set('category', nextCategory);
    const text = search.toString();
    return text ? `/yavayago?${text}` : '/yavayago';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {/* YavayaGo's own shape: a delivery app. Where you are comes first, in
          a bar over the photograph; then the two things you can ask for, the
          kinds of shop as big round icons, the shops themselves, and at the
          end the invitations to sell or to deliver. */}
      <section className="go-hero">
        <Rotulo id="yavayago" className="barrio-sign" />
        <div className="go-hero-art" aria-hidden="true">
          <DistrictScene id="yavayago" priority sizes="100vw" />
        </div>
        <div className="wrap go-hero-in">
          <p className="eyebrow">{c.districts.yavayago.name}</p>
          <h1>{t('go.home.title')}</h1>
          <p className="lead">{t('go.home.lead')}</p>
          <form className="go-where" action="/yavayago">
            <label>
              <span className="sr-only">{t('go.home.city')}</span>
              <PlacePicker name="place" value="code" labels={placePickerLabels(t, { any: true })} initial={placeLink} anyValue={ANY_PLACE} />
            </label>
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <button className="btn btn-gold" type="submit">
              {t('go.home.show')}
            </button>
          </form>
          <div className="go-modes">
            <a className="go-mode" href="#stores">
              <Icon name="store" />
              <strong>{t('go.home.stores_title')}</strong>
            </a>
            <Link className="go-mode" href="/yavayago/viajes">
              <Icon name="car" />
              <strong>{t('go.home.trips')}</strong>
            </Link>
            {member ? (
              <Link className="go-mode go-mode-quiet" href="/yavayago/orders">
                <Icon name="basket" />
                <strong>{t('go.home.my_orders')}</strong>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingBottom: 56 }}>
        <nav className="go-cats" aria-label={t('go.home.categories')}>
          <Link className={`go-cat${category ? '' : ' on'}`} href={link(null)}>
            <span className="go-cat-icon" aria-hidden="true">
              <Icon name="grid" />
            </span>
            {t('go.home.everything')}
          </Link>
          {GO_CATEGORIES.map((key) => (
            <Link key={key} className={`go-cat${category === key ? ' on' : ''}`} href={link(key)}>
              <span className="go-cat-icon" aria-hidden="true">
                <Icon name={CATEGORY_ICON[key]} />
              </span>
              {t(`go.category.${key}` as MessageKey)}
            </Link>
          ))}
        </nav>

        <ul className="go-promises">
          <li>
            <Icon name="shield" />
            <span>
              <strong>{t('go.promise.driver_title')}</strong> {t('go.promise.driver_text')}
            </span>
          </li>
          <li>
            <Icon name="map" />
            <span>
              <strong>{t('go.promise.live_title')}</strong> {t('go.promise.live_text')}
            </span>
          </li>
          <li>
            <Icon name="cash" />
            <span>
              <strong>{t('go.promise.cash_title')}</strong> {t('go.promise.cash_text')}
            </span>
          </li>
        </ul>

        <section id="stores" className="go-stores-wrap" aria-label={t('go.home.stores_title')}>
          {stores.length === 0 ? (
            <div className="go-empty">
              <p>
                <strong>{t('go.home.none_title')}</strong>
              </p>
              <p className="muted">{t('go.home.none_text')}</p>
              <Link className="btn btn-gold" href={member ? '/yavayago/store' : '/login?next=/yavayago/store'}>
                {t('go.home.open_store')}
              </Link>
            </div>
          ) : (
            <ul className="go-stores">
              {stores.map((s) => (
                <li key={s.id}>
                  <Link
                    className={`go-store-card${s.isOpen ? '' : ' closed'}${s.featuredUntil && s.featuredUntil.getTime() > Date.now() ? ' is-featured' : ''}`}
                    href={`/yavayago/stores/${s.id}`}
                    data-tilt=""
                  >
                    {s.featuredUntil && s.featuredUntil.getTime() > Date.now() ? <span className="mk-featured-tag go-featured-tag">{t('mercadito.feature.tag')}</span> : null}
                    <div className="go-store-photo">
                      {s.photoMediaId ? <img src={`/media/${s.photoMediaId}`} alt="" loading="lazy" /> : <span aria-hidden="true">{s.name.slice(0, 1)}</span>}
                      <span className={`go-badge ${s.isOpen ? 'open' : 'shut'}`}>{s.isOpen ? t('go.store.open') : t('go.store.closed')}</span>
                    </div>
                    <div className="go-store-text">
                      <strong>{s.name}</strong>
                      <span className="muted">
                        {t(`go.category.${s.category}` as MessageKey)} · {s.placeName}
                      </span>
                      <span className="go-meta">
                        {t('go.store.delivery_fee', { fee: money(s.deliveryFeeMinor, s.currency) })} · {t('go.store.prep', { minutes: s.prepMinutes })}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="go-partners">
          <Link className="go-partner" href={member ? '/yavayago/store' : '/login?next=/yavayago/store'}>
            <Icon name="store" />
            <strong>{store ? t('go.home.my_store') : t('go.home.open_store')}</strong>
          </Link>
          <Link className="go-partner" href={member ? '/yavayago/driver' : '/login?next=/yavayago/driver'}>
            <Icon name="car" />
            <strong>{driver ? t('go.home.my_driving') : t('go.home.drive')}</strong>
          </Link>
        </div>

        <div className="gv-end">
          <GuideVideo guideKey="yavayago" title={t('guide.watch_title', { name: c.nav.yavayago })} t={t} locale={locale} />
        </div>
        <p className="muted go-about-link">
          <Link href="/yavayago/about">{t('go.home.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
