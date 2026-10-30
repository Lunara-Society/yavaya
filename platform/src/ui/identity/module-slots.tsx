import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { TrustShield } from '@/server/domains/trust/shield';
import type { ProfileModuleData } from '@/server/domains/identity/profile-modules';
import { TrustShieldCard } from '@/ui/components/trust-shield';
import { Medallions } from '@/ui/components/medallions';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { categoryName } from '@/ui/services/parts';

/**
 * The parts of a profile that come from the member's real activity, rendered
 * on the server and handed to the profile canvas as slots. Each shows only
 * what its district's own public page shows, and links there.
 */

export function TrustSlot({ shield, t }: { shield: TrustShield; t: Translator }) {
  return (
    <>
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
    </>
  );
}

export function ListingsSlot({ listings, t, locale }: { listings: ProfileModuleData['listings']; t: Translator; locale: string }) {
  return (
    <div className="mk-grid tone-mercadito">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} t={t} locale={locale} showStatus={listing.status !== 'published'} />
      ))}
    </div>
  );
}

export function WorkSlot({ work, t }: { work: NonNullable<ProfileModuleData['work']>; t: Translator }) {
  return (
    <div className="idp-summary">
      <p>
        <strong>{work.headline}</strong>
        {work.openToWork ? <> · {t('work.profile.open_badge')}</> : null}
      </p>
      {work.fields.length ? <p>{work.fields.map((field) => t(`work.field.${field}` as MessageKey)).join(' · ')}</p> : null}
      {work.experienceYears !== null ? <p>{t('profile.module.work.experience', { years: work.experienceYears })}</p> : null}
      <p>{work.placeName}</p>
      <Link className="idp-more" href={`/work/pros/${work.yayId}`}>
        {t('profile.module.work.more')} →
      </Link>
    </div>
  );
}

export function ServicesSlot({ services, t }: { services: NonNullable<ProfileModuleData['services']>; t: Translator }) {
  const { summary } = services;
  return (
    <div className="idp-summary">
      <p>
        <strong>{summary.headline}</strong>
        {summary.availableToday ? <> · {t('services.provider.available_badge')}</> : null}
      </p>
      <p>{summary.categories.map((key) => categoryName(t, key)).join(' · ')}</p>
      {summary.averageRating !== null && summary.reviewCount > 0 ? (
        <p>{t('services.provider.rating', { rating: summary.averageRating, count: summary.reviewCount })}</p>
      ) : null}
      {summary.licenceStatus === 'verified' ? <p>{t('services.licence.verified')}</p> : null}
      <Link className="idp-more" href={`/services/providers/${summary.yayId}`}>
        {t('profile.module.services.more')} →
      </Link>
    </div>
  );
}

export function StoreSlot({ store, t }: { store: NonNullable<ProfileModuleData['store']>; t: Translator }) {
  return (
    <div className="idp-summary">
      <p>
        <strong>{store.name}</strong> · {t(`go.category.${store.category}` as MessageKey)} · {store.isOpen ? t('go.store.open') : t('go.store.closed')}
      </p>
      <Link className="idp-more" href={`/yavayago/stores/${store.id}`}>
        {t('profile.module.store.more')} →
      </Link>
    </div>
  );
}
