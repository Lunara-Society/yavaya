import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_CATEGORIES } from '@/config/go';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { DistrictScene } from '@/ui/site/art';
import { money } from '@/ui/go/format';
import { placeOptions } from '@/server/domains/mercadito/service';
import { browseStores, myDriver, myStore } from '@/server/domains/go/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.yavayago.title, description: c.pages.yavayago.description };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YavayaGo: stores near you that deliver, by drivers Yavaya checked. Public to browse. */
export default async function YavayaGo({ searchParams }: { searchParams: Promise<{ city?: string; category?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const countries = await placeOptions(db(), locale);
  const city = query.city && UUID.test(query.city) ? query.city : null;
  const category = (GO_CATEGORIES as readonly string[]).includes(query.category ?? '') ? query.category! : null;
  const [stores, store, driver] = await Promise.all([
    browseStores(db(), { locationIds: city ? [city] : null, category }),
    userId ? myStore(db(), userId) : Promise.resolve(null),
    userId ? myDriver(db(), userId) : Promise.resolve(null),
  ]);
  const link = (nextCategory: string | null) => {
    const search = new URLSearchParams();
    if (city) search.set('city', city);
    if (nextCategory) search.set('category', nextCategory);
    const text = search.toString();
    return text ? `/yavayago?${text}` : '/yavayago';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <section className="cm-head go-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="yavayago" priority />
        </div>
        <div className="wrap">
          <p className="eyebrow">{c.districts.yavayago.name}</p>
          <h1>{t('go.home.title')}</h1>
          <p className="lead">{t('go.home.lead')}</p>
          <div className="btn-row">
            {member ? (
              <Link className="btn btn-gold" href="/yavayago/orders">
                {t('go.home.my_orders')}
              </Link>
            ) : null}
            <Link className="btn btn-line" href={member ? '/yavayago/store' : '/login?next=/yavayago/store'}>
              {store ? t('go.home.my_store') : t('go.home.open_store')}
            </Link>
            <Link className="btn btn-line" href={member ? '/yavayago/driver' : '/login?next=/yavayago/driver'}>
              {driver ? t('go.home.my_driving') : t('go.home.drive')}
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingBottom: 56 }}>
        <ul className="go-promises">
          <li>
            <strong>{t('go.promise.driver_title')}</strong> {t('go.promise.driver_text')}
          </li>
          <li>
            <strong>{t('go.promise.live_title')}</strong> {t('go.promise.live_text')}
          </li>
          <li>
            <strong>{t('go.promise.cash_title')}</strong> {t('go.promise.cash_text')}
          </li>
        </ul>

        <form className="go-filters" action="/yavayago">
          <label>
            <span className="sr-only">{t('go.home.city')}</span>
            <select name="city" defaultValue={city ?? ''}>
              <option value="">{t('go.home.all_cities')}</option>
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
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <button className="btn btn-line" type="submit">
            {t('go.home.show')}
          </button>
        </form>

        <nav className="go-chips" aria-label={t('go.home.categories')}>
          <Link className={`go-chip${category ? '' : ' on'}`} href={link(null)}>
            {t('go.home.everything')}
          </Link>
          {GO_CATEGORIES.map((key) => (
            <Link key={key} className={`go-chip${category === key ? ' on' : ''}`} href={link(key)}>
              {t(`go.category.${key}` as MessageKey)}
            </Link>
          ))}
        </nav>

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
                <Link className={`go-store-card${s.isOpen ? '' : ' closed'}${s.featuredUntil && s.featuredUntil.getTime() > Date.now() ? ' is-featured' : ''}`} href={`/yavayago/stores/${s.id}`} data-tilt="">
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
        <p className="muted go-about-link">
          <Link href="/yavayago/about">{t('go.home.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
