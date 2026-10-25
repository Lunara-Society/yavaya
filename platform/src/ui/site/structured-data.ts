/**
 * Structured data (schema.org JSON-LD) for the pages a search engine can show
 * on their own: a job, a thing for sale, a shop. Each object says only what
 * its page already tells anyone who opens it — no ratings, no review counts,
 * no stock levels, no salary range the employer never gave as a figure — and
 * a page whose subject cannot be had (a filled or expired job, a reserved or
 * sold item, a shop not yet approved, anything registered as demo) gets none,
 * so a search result never offers what is not there.
 *
 * Pure: the pages pass in what they already loaded (ui/site/json-ld.tsx
 * renders the result).
 */

type Data = Record<string, unknown>;

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  temporary: 'TEMPORARY',
  freelance: 'CONTRACTOR',
};

/** `not_applicable` has no schema.org counterpart and is left out. */
const ITEM_CONDITION: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  like_new: 'https://schema.org/UsedCondition',
  used: 'https://schema.org/UsedCondition',
  for_parts: 'https://schema.org/DamagedCondition',
};

export type JobFacts = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  employment: string;
  placeMode: string;
  companyName: string | null;
  placeName: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * A job offer. Only an open post from a named company with a place to work:
 * search engines require the hiring organisation by name, and a person hiring
 * for themselves is not passed off as one. A remote post is left out too —
 * it would have to say where applicants may live, and Trabajo never asks.
 */
export function jobPostingData(post: JobFacts, where: { url: string; country: string | null; demo: boolean; now?: Date }): Data | null {
  const now = where.now ?? new Date();
  if (where.demo || post.status !== 'open' || post.expiresAt <= now) return null;
  if (!post.companyName || post.placeMode === 'remote' || !where.country) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: post.title,
    description: post.requirements ? `${post.description}\n\n${post.requirements}` : post.description,
    datePosted: post.createdAt.toISOString(),
    validThrough: post.expiresAt.toISOString(),
    ...(EMPLOYMENT_TYPE[post.employment] ? { employmentType: EMPLOYMENT_TYPE[post.employment] } : {}),
    hiringOrganization: { '@type': 'Organization', name: post.companyName },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: post.placeName, addressCountry: where.country } },
    identifier: { '@type': 'PropertyValue', name: 'Yavaya', value: post.id },
    url: where.url,
  };
}

export type ListingFacts = {
  title: string;
  description: string;
  priceMinor: number;
  currencyCode: string;
  condition: string;
  status: string;
  photos: ReadonlyArray<{ mediaId: string }>;
  seller: { displayName: string };
};

/** Minor units to the decimal string schema.org expects, by the currency's own number of decimals. */
export function decimalPrice(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return (minor / 10 ** digits).toFixed(digits);
}

/** A Mercadito listing that can be bought now: published, not reserved or sold. */
export function listingData(listing: ListingFacts, where: { url: string; base: string; category: string; demo: boolean }): Data | null {
  if (where.demo || listing.status !== 'published') return null;
  const condition = ITEM_CONDITION[listing.condition];
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: listing.description,
    ...(listing.photos.length ? { image: listing.photos.map((photo) => `${where.base}/media/${photo.mediaId}`) } : {}),
    category: where.category,
    url: where.url,
    offers: {
      '@type': 'Offer',
      url: where.url,
      price: decimalPrice(listing.priceMinor, listing.currencyCode),
      priceCurrency: listing.currencyCode,
      availability: 'https://schema.org/InStock',
      ...(condition ? { itemCondition: condition } : {}),
      // The seller's display name is on the page beside the listing; nothing else about them is.
      seller: { '@type': 'Person', name: listing.seller.displayName },
    },
  };
}

export type StoreFacts = {
  name: string;
  about: string | null;
  photoMediaId: string | null;
  placeName: string;
  status: string;
};

/**
 * A YavayaGo shop once approved. The town, not a street address: the page
 * shows only the town, and the map's pin is for finding the shop, not an
 * address to publish.
 */
export function storeData(store: StoreFacts, where: { url: string; base: string; country: string | null; demo: boolean }): Data | null {
  if (where.demo || store.status !== 'approved') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: store.name,
    ...(store.about ? { description: store.about } : {}),
    ...(store.photoMediaId ? { image: `${where.base}/media/${store.photoMediaId}` } : {}),
    url: where.url,
    address: { '@type': 'PostalAddress', addressLocality: store.placeName, ...(where.country ? { addressCountry: where.country } : {}) },
  };
}
