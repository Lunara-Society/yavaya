import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { DistrictScene } from '@/ui/site/art';
import { Icon, type IconName } from '@/ui/site/icons';
import type { MessageKey } from '@/i18n';
import { browseListings, markSavedSearchSeen } from '@/server/domains/mercadito/service';
import { saveSearchAction } from './actions';
import { LISTING_CATEGORIES, type ListingCategory } from '@/server/domains/mercadito/rules';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { ANY_PLACE, browsePlace } from '@/server/place-choice';
import { MERCADITO_RULES } from '@/config/business-rules';
import { FabWhenAway } from '@/ui/components/fab-when-away';

export const dynamic = 'force-dynamic';

/** Each category's mark, shared by the chips and the empty-market guide. */
const CATEGORY_ICON: Record<ListingCategory, IconName> = {
  vehicles: 'car',
  real_estate: 'house',
  electronics: 'phone',
  services: 'wrench',
  fashion: 'shirt',
  home: 'sofa',
  sports: 'ball',
  classifieds: 'tag',
};

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.mercadito.name, description: c.pages.mercadito.description };
}

type Search = { q?: string; cat?: string; place?: string; page?: string; saved?: string };

/**
 * The market itself. Everything here is a real listing by a real member —
 * no samples, no filler. An empty market says it is empty.
 */
export default async function MercaditoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();

  const category = (LISTING_CATEGORIES as readonly string[]).includes(params.cat ?? '')
    ? (params.cat as ListingCategory)
    : undefined;
  const { code: placeCode, link: placeLink } = await browsePlace(params.place, locale);
  const query = params.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const result = await browseListings(db(), { query, category, placeCode, page, locale });
  if (userId && params.saved && /^[0-9a-f-]{36}$/i.test(params.saved)) {
    await markSavedSearchSeen(db(), { userId, id: params.saved });
  }
  const filtered = Boolean(query || category || placeCode);

  const href = (next: Partial<Record<keyof Search, string | undefined>>) => {
    const merged = { q: query, cat: category, place: placeLink, ...next };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const text = search.toString();
    return text ? `/mercadito?${text}` : '/mercadito';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      {/* Mercadito's own shape: a market stall. The awning on top, one big
          search, categories you swipe through, and the goods in a tight grid. */}
      <section className="mc-top">
        <div className="mc-awning" aria-hidden="true" />
        <div className="mc-top-art" aria-hidden="true">
          <DistrictScene id="mercadito" priority />
        </div>
        <div className="wrap mc-top-in">
          <div className="mc-head">
            <div>
              <h1>{c.districts.mercadito.name}</h1>
              <p className="lead mb0">{t('mercadito.browse.lead')}</p>
            </div>
            <div className="btn-row mc-head-actions">
              {member ? (
                <Link className="btn btn-line" href="/mercadito/mine">
                  {t('mercadito.browse.mine')}
                </Link>
              ) : null}
              <Link className="btn btn-gold" href="/mercadito/publish">
                {t('mercadito.browse.publish_free')}
              </Link>
            </div>
          </div>

          <form className="mc-search" action="/mercadito" method="get" role="search">
            <div className="mc-search-row">
              <label className="sr-only" htmlFor="mc-q">
                {t('mercadito.browse.search_label')}
              </label>
              <input id="mc-q" type="search" name="q" defaultValue={query} maxLength={80} placeholder={t('mercadito.browse.search_placeholder')} />
              {category ? <input type="hidden" name="cat" value={category} /> : null}
              <button className="btn btn-gold" type="submit">
                {t('mercadito.browse.submit')}
              </button>
            </div>
            <details className="mc-place" open={Boolean(placeCode)}>
              <summary>
                {t('mercadito.browse.place_label')}: {placeCode ? t('mercadito.browse.place_chosen') : t('mercadito.browse.all_places')}
              </summary>
              <PlacePicker name="place" value="code" labels={placePickerLabels(t, { any: true })} initial={placeLink} anyValue={ANY_PLACE} />
            </details>
          </form>

          <nav className="mc-cats" aria-label={t('mercadito.browse.category_label')}>
            <Link href={href({ cat: undefined, page: undefined })} aria-current={category ? undefined : 'true'}>
              {t('mercadito.browse.all_categories')}
            </Link>
            {LISTING_CATEGORIES.map((key) => (
              <Link key={key} href={href({ cat: key, page: undefined })} aria-current={category === key ? 'true' : undefined}>
                <Icon name={CATEGORY_ICON[key]} />
                {t(`mercadito.category.${key}` as MessageKey)}
              </Link>
            ))}
          </nav>

          {member && filtered ? (
            <form action={saveSearchAction} className="mk-save">
              <input type="hidden" name="q" value={query ?? ''} />
              <input type="hidden" name="cat" value={category ?? ''} />
              <input type="hidden" name="place" value={placeCode ?? ''} />
              <button type="submit" className="chip">
                ☆ {t('mercadito.saved.save')}
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="wrap mc-market" aria-label={t('mercadito.browse.results_label')}>
        {result.items.length > 0 ? (
          <div className="mk-grid mc-grid">
            {result.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} t={t} locale={locale} />
            ))}
          </div>
        ) : filtered ? (
          <div className="mk-empty">
            <p>{t('mercadito.browse.none')}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-line" href="/mercadito">
                {t('mercadito.browse.clear')}
              </Link>
              <Link className="btn btn-gold" href="/mercadito/publish">
                {t('mercadito.browse.publish_free')}
              </Link>
            </div>
          </div>
        ) : (
          // An empty market says so — and shows how little it takes to be its first stall.
          <div className="mc-opening">
            <p className="eyebrow">{t('mercadito.opening.eyebrow')}</p>
            <h2>{t('mercadito.opening.title')}</h2>
            <p className="muted">{t('mercadito.browse.empty')}</p>
            <ol className="mc-steps">
              <li>
                <span className="mc-step-n">1</span>
                <strong>{t('mercadito.opening.step1')}</strong>
                <span>{t('mercadito.opening.step1_text')}</span>
              </li>
              <li>
                <span className="mc-step-n">2</span>
                <strong>{t('mercadito.opening.step2')}</strong>
                <span>{t('mercadito.opening.step2_text')}</span>
              </li>
              <li>
                <span className="mc-step-n">3</span>
                <strong>{t('mercadito.opening.step3')}</strong>
                <span>{t('mercadito.opening.step3_text')}</span>
              </li>
            </ol>
            <Link className="btn btn-gold mc-opening-cta" href="/mercadito/publish">
              {t('mercadito.browse.publish_free')}
            </Link>
            <p className="muted mc-opening-fine">{t('mercadito.opening.free', { count: MERCADITO_RULES.freeOpenListings })}</p>
            <ul className="mk-kinds">
              {LISTING_CATEGORIES.map((key) => (
                <li key={key}>
                  <span className="mk-kind-ico">
                    <Icon name={CATEGORY_ICON[key]} />
                  </span>
                  {t(`mercadito.category.${key}` as MessageKey)}
                </li>
              ))}
            </ul>
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
      </section>

      <div className="wrap mc-guide">
        <GuideVideo guideKey="mercadito" title={t('guide.watch_title', { name: c.nav.mercadito })} t={t} locale={locale} />
        <p className="center">
          <Link href="/mercadito/about">{t('mercadito.browse.how')}</Link>
        </p>
      </div>

      {/* On a phone the way to sell is always one thumb away — once the header's own button has scrolled off. */}
      <FabWhenAway className="mc-fab" href="/mercadito/publish" watch=".mc-head-actions">
        <span aria-hidden="true">+</span> {t('mercadito.browse.publish_free')}
      </FabWhenAway>
    </SiteShell>
  );
}
