import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ListingCard } from '@/ui/mercadito/listing-card';
import type { MessageKey } from '@/i18n';
import { browseListings, placeOptions } from '@/server/domains/mercadito/service';
import { LISTING_CATEGORIES, type ListingCategory } from '@/server/domains/mercadito/rules';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.mercadito.name, description: c.pages.mercadito.description };
}

type Search = { q?: string; cat?: string; place?: string; page?: string };

/**
 * The market itself. Everything here is a real listing by a real member —
 * no samples, no filler. An empty market says it is empty.
 */
export default async function MercaditoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member } = await siteContext();

  const category = (LISTING_CATEGORIES as readonly string[]).includes(params.cat ?? '')
    ? (params.cat as ListingCategory)
    : undefined;
  const countries = await placeOptions(db(), locale);
  const placeCode = countries.some((country) => country.code === params.place) ? params.place : undefined;
  const query = params.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const result = await browseListings(db(), { query, category, placeCode, page, locale });
  const filtered = Boolean(query || category || placeCode);

  const href = (next: Partial<Record<keyof Search, string | undefined>>) => {
    const merged = { q: query, cat: category, place: placeCode, ...next };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const text = search.toString();
    return text ? `/mercadito?${text}` : '/mercadito';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1>{c.districts.mercadito.name}</h1>
              <p className="lead mb0">{t('mercadito.browse.lead')}</p>
            </div>
            <div className="btn-row">
              {member ? (
                <Link className="btn btn-line" href="/mercadito/mine">
                  {t('mercadito.browse.mine')}
                </Link>
              ) : null}
              <Link className="btn btn-gold" href="/mercadito/publish">
                {t('mercadito.browse.publish')}
              </Link>
            </div>
          </div>

          <form className="mk-bar" action="/mercadito" method="get" role="search">
            <label className="grow">
              {t('mercadito.browse.search_label')}
              <input type="search" name="q" defaultValue={query} maxLength={80} placeholder={t('mercadito.browse.search_placeholder')} />
            </label>
            <label>
              {t('mercadito.browse.category_label')}
              <select name="cat" defaultValue={category ?? ''}>
                <option value="">{t('mercadito.browse.all_categories')}</option>
                {LISTING_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {t(`mercadito.category.${key}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('mercadito.browse.place_label')}
              <select name="place" defaultValue={placeCode ?? ''}>
                <option value="">{t('mercadito.browse.all_places')}</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-gold" type="submit" style={{ minHeight: 44 }}>
              {t('mercadito.browse.submit')}
            </button>
          </form>

          <nav className="mk-cats" aria-label={t('mercadito.browse.category_label')}>
            <Link href={href({ cat: undefined, page: undefined })} aria-current={category ? undefined : 'true'}>
              {t('mercadito.browse.all_categories')}
            </Link>
            {LISTING_CATEGORIES.map((key) => (
              <Link key={key} href={href({ cat: key, page: undefined })} aria-current={category === key ? 'true' : undefined}>
                {t(`mercadito.category.${key}` as MessageKey)}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="wrap" aria-label={t('mercadito.browse.results_label')} style={{ paddingBottom: 48 }}>
        {result.items.length === 0 ? (
          <div className="mk-empty">
            <p>{filtered ? t('mercadito.browse.none') : t('mercadito.browse.empty')}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              {filtered ? (
                <Link className="btn btn-line" href="/mercadito">
                  {t('mercadito.browse.clear')}
                </Link>
              ) : null}
              <Link className="btn btn-gold" href="/mercadito/publish">
                {t('mercadito.browse.publish')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mk-grid">
            {result.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} t={t} locale={locale} />
            ))}
          </div>
        )}

        {result.page > 1 || result.hasMore ? (
          <nav className="mk-pager">
            {result.page > 1 ? (
              <Link className="btn btn-line" href={href({ page: String(result.page - 1) })}>
                {t('mercadito.browse.previous')}
              </Link>
            ) : null}
            {result.hasMore ? (
              <Link className="btn btn-line" href={href({ page: String(result.page + 1) })}>
                {t('mercadito.browse.next')}
              </Link>
            ) : null}
          </nav>
        ) : null}

        <p className="center mt">
          <Link href="/mercadito/about">{t('mercadito.browse.how')}</Link>
        </p>
      </section>
    </SiteShell>
  );
}
