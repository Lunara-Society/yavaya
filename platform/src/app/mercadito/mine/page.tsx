import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { WhatsappForm } from '@/ui/mercadito/whatsapp-form';
import {
  getWhatsapp,
  listSavedSearches,
  placeOptions,
  sellerListings,
  type SavedSearch,
} from '@/server/domains/mercadito/service';
import type { MessageKey } from '@/i18n';
import { deleteSavedSearchAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.mine.title'), robots: { index: false } };
}

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ wa?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');

  const [listings, whatsapp, saved, countries] = await Promise.all([
    sellerListings(db(), userId, locale),
    getWhatsapp(db(), userId),
    listSavedSearches(db(), userId),
    placeOptions(db(), locale),
  ]);
  const countryName = (code: string | null) => countries.find((country) => country.code === code)?.name ?? null;
  const searchHref = (search: SavedSearch) => {
    const params = new URLSearchParams();
    if (search.query) params.set('q', search.query);
    if (search.category) params.set('cat', search.category);
    if (search.placeCode) params.set('place', search.placeCode);
    params.set('saved', search.id);
    return `/mercadito?${params.toString()}`;
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>{t('mercadito.mine.title')}</h1>
            <Link className="btn btn-gold" href="/mercadito/publish">
              {t('mercadito.browse.publish')}
            </Link>
          </div>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {listings.length === 0 ? (
          <p className="mk-empty">{t('mercadito.mine.empty')}</p>
        ) : (
          <div className="mk-grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} t={t} locale={locale} showStatus />
            ))}
          </div>
        )}
        <section className="mt" style={{ maxWidth: 820 }}>
          <h2 className="h-md" style={{ fontSize: '1.4rem' }}>
            {t('mercadito.saved.title')}
          </h2>
          {query.saved === 'ok' ? <p className="mk-banner">{t('mercadito.saved.ok')}</p> : null}
          {query.saved === 'limit' ? <p className="mk-error">{t('mercadito.saved.limit')}</p> : null}
          {saved.length === 0 ? (
            <p className="muted">{t('mercadito.saved.empty')}</p>
          ) : (
            <ul className="mk-saved">
              {saved.map((search) => (
                <li key={search.id}>
                  <Link href={searchHref(search)} className="mk-saved-link">
                    <strong>
                      {[
                        search.query ? `“${search.query}”` : null,
                        search.category ? t(`mercadito.category.${search.category}` as MessageKey) : null,
                        countryName(search.placeCode ?? null),
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('mercadito.saved.anything')}
                    </strong>
                    <span className={search.newCount > 0 ? 'mk-saved-new' : 'muted'}>
                      {search.newCount > 0 ? t('mercadito.saved.new', { count: search.newCount }) : t('mercadito.saved.none_new')}
                    </span>
                  </Link>
                  <form action={deleteSavedSearchAction}>
                    <input type="hidden" name="id" value={search.id} />
                    <button type="submit" className="chip">
                      {t('mercadito.saved.delete')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt" style={{ maxWidth: 820 }}>
          <WhatsappForm t={t} current={whatsapp} back="/mercadito/mine" invalid={query.wa === 'invalid'} />
        </div>
      </div>
    </SiteShell>
  );
}
