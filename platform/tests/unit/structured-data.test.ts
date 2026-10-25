import { describe, expect, it } from 'vitest';
import { decimalPrice, jobPostingData, listingData, storeData, type JobFacts, type ListingFacts, type StoreFacts } from '@/ui/site/structured-data';

const now = new Date('2026-10-25T12:00:00Z');
const job: JobFacts = {
  id: '0b6f3c2e-8a51-4c1e-9d3f-2f7a1c9e4b10',
  title: 'Recepcionista bilingüe',
  description: 'Atención en recepción, turno de mañana.',
  requirements: 'Inglés intermedio.',
  employment: 'full_time',
  placeMode: 'onsite',
  companyName: 'Hotel Ejemplo',
  placeName: 'Antigua Guatemala',
  status: 'open',
  createdAt: new Date('2026-10-20T12:00:00Z'),
  expiresAt: new Date('2026-11-20T12:00:00Z'),
};
const jobWhere = { url: 'https://yavaya.lat/work/posts/x', country: 'GT', demo: false, now };

describe('job offers for search engines', () => {
  it('states what the post says, and where', () => {
    const data = jobPostingData(job, jobWhere)!;
    expect(data['@type']).toBe('JobPosting');
    expect(data.employmentType).toBe('FULL_TIME');
    expect(data.hiringOrganization).toEqual({ '@type': 'Organization', name: 'Hotel Ejemplo' });
    expect(data.jobLocation).toEqual({ '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Antigua Guatemala', addressCountry: 'GT' } });
    expect(data.description).toContain('Inglés intermedio.');
    // Pay is the employer's own words; it is never turned into a salary figure.
    expect(data).not.toHaveProperty('baseSalary');
  });

  it('says nothing about a post that cannot be applied to, or that it cannot state truthfully', () => {
    expect(jobPostingData({ ...job, status: 'filled' }, jobWhere)).toBeNull();
    expect(jobPostingData({ ...job, expiresAt: new Date('2026-10-24T12:00:00Z') }, jobWhere)).toBeNull();
    expect(jobPostingData(job, { ...jobWhere, demo: true })).toBeNull();
    // A person hiring for themselves is not passed off as an organisation.
    expect(jobPostingData({ ...job, companyName: null }, jobWhere)).toBeNull();
    // Remote work would need applicant location rules Trabajo never asks for.
    expect(jobPostingData({ ...job, placeMode: 'remote' }, jobWhere)).toBeNull();
    expect(jobPostingData(job, { ...jobWhere, country: null })).toBeNull();
  });
});

const listing: ListingFacts = {
  title: 'Bicicleta de montaña',
  description: 'Rodada 29, poco uso.',
  priceMinor: 275_000,
  currencyCode: 'GTQ',
  condition: 'like_new',
  status: 'published',
  photos: [{ mediaId: 'a1' }, { mediaId: 'b2' }],
  seller: { displayName: 'Ana' },
};
const listingWhere = { url: 'https://yavaya.lat/mercadito/x', base: 'https://yavaya.lat', category: 'Deportes', demo: false };

describe('listings for search engines', () => {
  it('offers the item at its price, in its condition', () => {
    const data = listingData(listing, listingWhere)!;
    expect(data['@type']).toBe('Product');
    expect(data.image).toEqual(['https://yavaya.lat/media/a1', 'https://yavaya.lat/media/b2']);
    expect(data.offers).toMatchObject({ price: '2750.00', priceCurrency: 'GTQ', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/UsedCondition' });
    // No ratings or review counts: Yavaya has none to give.
    expect(data).not.toHaveProperty('aggregateRating');
  });

  it('leaves out a condition schema.org has no word for, and items that cannot be bought', () => {
    expect((listingData({ ...listing, condition: 'not_applicable' }, listingWhere)!.offers as Record<string, unknown>).itemCondition).toBeUndefined();
    expect(listingData({ ...listing, status: 'reserved' }, listingWhere)).toBeNull();
    expect(listingData({ ...listing, status: 'sold' }, listingWhere)).toBeNull();
    expect(listingData(listing, { ...listingWhere, demo: true })).toBeNull();
  });

  it('writes prices with the currency’s own decimals', () => {
    expect(decimalPrice(99, 'USD')).toBe('0.99');
    expect(decimalPrice(1_400_000, 'NIO')).toBe('14000.00');
  });
});

const store: StoreFacts = { name: 'Pupusería La Ceiba', about: 'Pupusas de queso y loroco.', photoMediaId: 'c3', placeName: 'Managua', status: 'approved' };
const storeWhere = { url: 'https://yavaya.lat/yavayago/stores/x', base: 'https://yavaya.lat', country: 'NI', demo: false };

describe('shops for search engines', () => {
  it('names the shop and its town, not a street', () => {
    const data = storeData(store, storeWhere)!;
    expect(data['@type']).toBe('LocalBusiness');
    expect(data.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Managua', addressCountry: 'NI' });
    expect(data.image).toBe('https://yavaya.lat/media/c3');
  });

  it('says nothing about a shop that is not approved, or is demo', () => {
    expect(storeData({ ...store, status: 'pending' }, storeWhere)).toBeNull();
    expect(storeData(store, { ...storeWhere, demo: true })).toBeNull();
  });
});
