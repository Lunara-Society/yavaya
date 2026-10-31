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
  renewalRules,
  sellerListings,
  type SavedSearch,
} from '@/server/domains/mercadito/service';
import type { MessageKey } from '@/i18n';
import { deleteSavedSearchAction } from '../actions';
import { placeByCode } from '@/server/domains/geography/places';
import { signInPath } from '@/server/auth/sign-in-path';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.mine.title'), robots: { index: false } };
}

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ wa?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());

  const [listings, whatsapp, saved, renewal] = await Promise.all([
    sellerListings(db(), userId, locale),
    getWhatsapp(db(), userId),
    listSavedSearches(db(), userId),
    renewalRules(db()),
  ]);
  // Listings that have sat a while without a renewal: offered a way back to the top, never pushed.
  // Only by age — Yavaya does not count views, so it never claims a listing "got no visits".
  const DAY_MS = 24 * 60 * 60 * 1000;
  const quiet = listings
    .filter((listing) => listing.status === 'published' && !listing.featured)
    .map((listing) => ({ listing, days: Math.floor((Date.now() - (listing.renewedAt ?? listing.publishedAt).getTime()) / DAY_MS) }))
    .filter(({ days }) => days >= renewal.suggestAfterDays);
  const placeNames = new Map(
    await Promise.all(
      [...new Set(saved.map((search) => search.placeCode).filter((code): code is string => Boolean(code)))].map(
        async (code) => [code, (await placeByCode(db(), code, locale))?.name ?? null] as const,
      ),
    ),
  );
  const placeName = (code: string | null) => (code ? placeNames.get(code) ?? null : null);
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
        {quiet.length > 0 && (renewal.cost !== null) ? (
          <section className="mk-feature" style={{ maxWidth: 820, marginBottom: 24 }} aria-labelledby="quiet-h">
            <h2 id="quiet-h" className="mk-feature-h">{t('mercadito.nudge.title')}</h2>
            <p className="hint muted mb0">{t('mercadito.nudge.body', { days: renewal.suggestAfterDays })}</p>
            <ul className="mk-saved">
              {quiet.map(({ listing, days }) => (
                <li key={listing.id}>
                  <Link href={`/mercadito/${listing.id}#renovar`} className="mk-saved-link">
                    <strong>{listing.title}</strong>
                    <span className="muted">{t('mercadito.nudge.age', { days })}</span>
                  </Link>
                  <Link className="chip" href={`/mercadito/${listing.id}#renovar`}>
                    {t('mercadito.nudge.action')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
                        placeName(search.placeCode ?? null),
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
