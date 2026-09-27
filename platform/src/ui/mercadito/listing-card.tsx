import Link from 'next/link';
import type { Translator, MessageKey } from '@/i18n';
import type { ListingCard as Card } from '@/server/domains/mercadito/service';
import { formatPrice } from './format';

/**
 * A listing in the grid. Price first — it is what a buyer scans for — then
 * the title and the place. The photo is the seller's own, served from this
 * origin.
 */
export function ListingCard({
  listing,
  t,
  locale,
  showStatus,
}: {
  listing: Card;
  t: Translator;
  locale: string;
  showStatus?: boolean;
}) {
  return (
    <Link className="mk-card" href={`/mercadito/${listing.id}`} data-tilt="">
      <div className="ph">
        {listing.coverMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served already sized by the media pipeline
          <img src={`/media/${listing.coverMediaId}`} alt="" loading="lazy" decoding="async" />
        ) : (
          <span>{t('mercadito.browse.no_photo')}</span>
        )}
      </div>
      <div className="bd">
        {showStatus ? <span className="st">{t(`mercadito.status.${listing.status}` as MessageKey)}</span> : null}
        <span className="pr">{formatPrice(listing.priceMinor, listing.currencyCode, locale)}</span>
        <span className="ti">{listing.title}</span>
        <span className="pl">{listing.placeName}</span>
      </div>
    </Link>
  );
}
