import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PageScene } from '@/ui/site/art';
import { TrustShieldCard } from '@/ui/components/trust-shield';
import { Medallions } from '@/ui/components/medallions';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { formatDate } from '@/ui/mercadito/format';
import { findPublicMember } from '@/server/domains/identity/profile';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { sellerListings } from '@/server/domains/mercadito/service';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ yayId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { yayId } = await params;
  const member = await findPublicMember(db(), yayId);
  return member ? { title: member.displayName } : {};
}

/**
 * A member's public profile — "the profile becomes the user's digital
 * identity" (Master Bible). It shows only what the Trust Shield boundary
 * allows, their badges, and what they have up in Mercadito.
 */
export default async function MemberProfilePage({ params }: Params) {
  const { yayId } = await params;
  const { c, t, locale, language, theme, member } = await siteContext();
  const profile = await findPublicMember(db(), yayId);
  if (!profile) notFound();

  const [shield, listings] = await Promise.all([
    buildTrustShield(db(), profile.userId),
    sellerListings(db(), profile.userId, locale, { publicOnly: true }),
  ]);
  if (!shield) notFound();

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="wrap profile-page">
        <section className="member-hero">
          <PageScene name="street" className="member-hero-photo" />
          <div className="member-hero-text">
            <p className="member-hero-eyebrow">{t('profile.eyebrow')}</p>
            <h1>{profile.displayName}</h1>
            <p>{t('profile.since', { date: formatDate(profile.memberSince, locale) })}</p>
          </div>
        </section>

        <div className="profile-grid">
          <TrustShieldCard shield={shield} t={t} />
          <section className="card">
            <h2 className="h-md" style={{ fontSize: '1.4rem', marginBottom: 6 }}>
              {t('profile.medals')}
            </h2>
            <p className="muted" style={{ marginBottom: 18 }}>
              {t('profile.medals_lead')}
            </p>
            <Medallions shield={shield} t={t} />
          </section>
        </div>

        <section style={{ marginTop: 36 }}>
          <h2 className="h-md" style={{ fontSize: '1.4rem' }}>
            {t('profile.listings')}
          </h2>
          {listings.length === 0 ? (
            <p className="mk-empty">{t('profile.no_listings')}</p>
          ) : (
            <div className="mk-grid tone-mercadito">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} t={t} locale={locale} showStatus={listing.status !== 'published'} />
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
