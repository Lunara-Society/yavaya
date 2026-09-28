import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { TrustShieldCard } from '@/ui/components/trust-shield';
import { formatDate, formatPrice } from '@/ui/mercadito/format';
import { Gallery } from '@/ui/mercadito/gallery';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { hasPermission } from '@/server/domains/access/authorize';
import { getListing, similarListings, type ListingDetail } from '@/server/domains/mercadito/service';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { OPEN_STATUSES, PUBLIC_STATUSES, whatsappLink } from '@/server/domains/mercadito/rules';
import { LISTING_REPORT_CATEGORIES } from '@/server/domains/mercadito/moderation';
import { closeListingAction, reportListingAction, reserveListingAction } from '../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ reported?: string; report?: string }> };

/**
 * Who may see a listing: anyone while it is up or once sold; only its seller
 * and moderators after it was withdrawn or removed.
 */
async function visibleListing(id: string, locale: string, userId: string | null): Promise<ListingDetail | null> {
  if (!UUID.test(id)) return null;
  const listing = await getListing(db(), id, locale);
  if (!listing) return null;
  if ((PUBLIC_STATUSES as readonly string[]).includes(listing.status)) return listing;
  if (!userId) return null;
  if (listing.seller.userId === userId) return listing;
  return (await hasPermission(db(), userId, 'listings.moderate')) ? listing : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const { locale, userId } = await siteContext();
  const listing = await visibleListing(id, locale, userId);
  if (!listing) return {};
  return { title: listing.title, description: listing.description.slice(0, 160) };
}

export default async function ListingPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const listing = await visibleListing(id, locale, userId);
  if (!listing) notFound();

  const [shield, similar] = await Promise.all([
    buildTrustShield(db(), listing.seller.userId),
    similarListings(db(), { listingId: listing.id, category: listing.category, locale }),
  ]);
  const own = userId === listing.seller.userId;
  const listingUrl = `${serverEnv().APP_URL.replace(/\/$/, '')}/mercadito/${listing.id}`;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <div className="wrap">
        <p style={{ marginTop: 18 }}>
          <Link href="/mercadito">← {t('mercadito.listing.back')}</Link>
        </p>

        <div className="mk-detail">
          <div>
            {listing.status !== 'published' ? (
              <p className="mk-banner" role="status">
                {t(`mercadito.listing.banner_${listing.status}` as MessageKey)}
              </p>
            ) : null}

            <Gallery
              photos={listing.photos}
              altFor={listing.photos.map((_, i) =>
                t('mercadito.listing.photo_alt', { n: i + 1, total: listing.photos.length, title: listing.title }),
              )}
            />

            <h1 className="h-md" style={{ marginTop: 20 }}>
              {listing.title}
            </h1>
            <p className="mk-price">{formatPrice(listing.priceMinor, listing.currencyCode, locale)}</p>

            <dl className="mk-facts">
              <dt>{t('mercadito.listing.category')}</dt>
              <dd>
                <Link href={`/mercadito?cat=${listing.category}`}>
                  {t(`mercadito.category.${listing.category}` as MessageKey)}
                </Link>
              </dd>
              <dt>{t('mercadito.listing.condition')}</dt>
              <dd>{t(`mercadito.condition.${listing.condition}` as MessageKey)}</dd>
              <dt>{t('mercadito.listing.place')}</dt>
              <dd>{listing.placeTrail.join(', ')}</dd>
            </dl>
            <p className="muted">{t('mercadito.listing.published_on', { date: formatDate(listing.publishedAt, locale) })}</p>

            <h2 className="h-md" style={{ marginTop: 24, fontSize: '1.3rem' }}>
              {t('mercadito.listing.description')}
            </h2>
            <p className="mk-desc">{listing.description}</p>
          </div>

          <aside className="mk-side">
            <div className="card">
              <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>{t('mercadito.listing.seller')}</h2>
              <p className="mb0">
                <Link href={`/members/${listing.seller.yayId}`}>
                  <strong>{listing.seller.displayName}</strong>
                </Link>
              </p>
              <p className="muted">
                {t('mercadito.listing.member_since', { date: formatDate(listing.seller.memberSince, locale) })}
              </p>

              {own ? (
                <SellerControls listing={listing} t={t} />
              ) : !(OPEN_STATUSES as readonly string[]).includes(listing.status) ? null : !member ? (
                <Link className="btn btn-gold" href="/login" style={{ width: '100%' }}>
                  {t('mercadito.listing.sign_in_to_contact')}
                </Link>
              ) : listing.seller.whatsappE164 ? (
                <>
                  <a
                    className="btn mk-wa"
                    style={{ width: '100%' }}
                    href={whatsappLink(
                      listing.seller.whatsappE164,
                      t('mercadito.listing.contact_message', { title: listing.title, url: listingUrl }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('mercadito.listing.contact')}
                  </a>
                  {listing.seller.phoneVerified ? (
                    <p className="mk-verified" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                      <span aria-hidden="true">✓</span> {t('mercadito.listing.phone_verified')}
                    </p>
                  ) : (
                    <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                      {t('mercadito.listing.phone_unverified')}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">{t('mercadito.listing.no_phone')}</p>
              )}
            </div>

            {shield ? <TrustShieldCard shield={shield} t={t} /> : null}

            <div className="card">
              <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('mercadito.safety.title')}</h2>
              <ul className="list-check">
                <li>{t('mercadito.safety.one')}</li>
                <li>{t('mercadito.safety.two')}</li>
                <li>{t('mercadito.safety.three')}</li>
                <li>{t('mercadito.safety.four')}</li>
              </ul>
            </div>

            {member && !own && listing.status !== 'removed' ? (
              query.reported ? (
                <p className="mk-banner" role="status">
                  {t('mercadito.report.done', { code: query.reported.slice(0, 16) })}
                </p>
              ) : (
                <details className="card">
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('mercadito.report.title')}</summary>
                  {query.report === 'limited' ? (
                    <p className="mk-error mt">{t('mercadito.report.limited')}</p>
                  ) : null}
                  <form action={reportListingAction} className="mk-form" style={{ marginTop: 14 }}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <label>
                      {t('mercadito.report.category')}
                      <select name="category" required defaultValue="">
                        <option value="" disabled>
                          {t('mercadito.form.choose')}
                        </option>
                        {LISTING_REPORT_CATEGORIES.map((key) => (
                          <option key={key} value={key}>
                            {t(`mercadito.report.category.${key}` as MessageKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('mercadito.report.details')}
                      <textarea name="details" maxLength={2000} style={{ minHeight: 100 }} />
                    </label>
                    <button className="btn btn-line" type="submit">
                      {t('mercadito.report.submit')}
                    </button>
                  </form>
                </details>
              )
            ) : null}
          </aside>
        </div>

        {similar.length > 0 ? (
          <section className="mk-similar">
            <h2 className="h-md" style={{ fontSize: '1.4rem' }}>
              {t('mercadito.listing.similar')}
            </h2>
            <div className="mk-grid">
              {similar.map((card) => (
                <ListingCard key={card.id} listing={card} t={t} locale={locale} showStatus={card.status !== 'published'} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}

function SellerControls({ listing, t }: { listing: ListingDetail; t: Parameters<typeof TrustShieldCard>[0]['t'] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="mk-banner mb0">{t('mercadito.listing.own')}</p>
      {(OPEN_STATUSES as readonly string[]).includes(listing.status) ? (
        <>
          <Link className="btn btn-gold" href={`/mercadito/${listing.id}/edit`}>
            {t('mercadito.listing.edit')}
          </Link>
          <form action={reserveListingAction}>
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="reserved" value={listing.status === 'reserved' ? '0' : '1'} />
            <button className="btn btn-line" type="submit" style={{ width: '100%' }}>
              {t(listing.status === 'reserved' ? 'mercadito.listing.unreserve' : 'mercadito.listing.reserve')}
            </button>
          </form>
          <form action={closeListingAction}>
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="outcome" value="sold" />
            <button className="btn btn-line" type="submit" style={{ width: '100%' }}>
              {t('mercadito.listing.mark_sold')}
            </button>
          </form>
          <form action={closeListingAction}>
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="outcome" value="withdrawn" />
            <button className="btn btn-line" type="submit" style={{ width: '100%' }}>
              {t('mercadito.listing.withdraw')}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
