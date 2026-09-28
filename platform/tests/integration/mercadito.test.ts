import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import {
  auditEvents,
  enforcementRecords,
  locations,
  media,
  mercaditoListings,
  reputationScores,
  tickets,
  users,
} from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { getBalance, grantStarterTokensForPeriod } from '@/server/domains/tokens/service';
import { grantRole } from '@/server/domains/access/authorize';
import { processImage, sniffImageType } from '@/server/domains/media/image';
import { readActiveImage, storeImages } from '@/server/domains/media/service';
import { useMediaStorageForTests, type MediaStorage } from '@/server/domains/media/storage';
import {
  browseListings,
  closeListing,
  getListing,
  publishListing,
  sellerListings,
  sellerStanding,
  setWhatsapp,
  updateListing,
} from '@/server/domains/mercadito/service';
import { listingQueue, reportListing, resolveListingTicket } from '@/server/domains/mercadito/moderation';
import { listingInputSchema, parsePriceToMinor, normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { REPUTATION_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/** In-memory object store: the S3 adapter's contract, without a network. */
class MemoryStorage implements MediaStorage {
  readonly key = 'memory';
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const storage = new MemoryStorage();
const context = { networkHash: null, addressHash: 'mercadito-test', deviceFingerprint: null, userAgent: 'vitest' };

let placeId: string;
let placeCurrency: string;

async function jpeg(seed: number, withMetadata = false): Promise<Buffer> {
  let image = sharp({
    create: { width: 64 + seed, height: 48, channels: 3, background: { r: seed % 255, g: 90, b: 140 } },
  }).jpeg();
  if (withMetadata) {
    image = image.withExif({ IFD0: { Make: 'LeakyCam', Copyright: 'secret-owner' } });
  }
  return image.toBuffer();
}

async function createMember(options: { ageDays?: number; tokens?: number } = {}) {
  const { userId } = await register(
    db(),
    {
      email: `seller-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Vendedor',
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  const createdAt = new Date(Date.now() - (options.ageDays ?? 0) * 86_400_000);
  await db().update(users).set({ status: 'active', createdAt }).where(eq(users.id, userId));
  // Starter grants are the only source of tokens that needs no admin: two
  // per period, so each period adds two.
  const periods = Math.ceil((options.tokens ?? 2) / 2);
  for (let period = 0; period < periods; period += 1) {
    await db().transaction((tx) =>
      grantStarterTokensForPeriod(tx, {
        userId,
        accountCreatedAt: createdAt,
        now: new Date(createdAt.getTime() + period * 86_400_000 + 1000),
      }),
    );
  }
  return userId;
}

const input = (overrides: Record<string, string> = {}) =>
  listingInputSchema.parse({
    title: 'Bicicleta de montaña',
    description: 'Rodado 29, frenos de disco, poco uso.',
    price: '1500',
    currency: placeCurrency,
    category: 'sports',
    condition: 'used',
    locationId: placeId,
    ...overrides,
  });

async function publish(sellerUserId: string, seed = 1, overrides: Record<string, string> = {}) {
  const listingId = crypto.randomUUID();
  const images = await storeImages({ ownerUserId: sellerUserId, purpose: 'listing_photo', files: [await jpeg(seed)] });
  await db().transaction((tx) =>
    publishListing(tx, { listingId, sellerUserId, input: input(overrides), images }),
  );
  return { listingId, images };
}

beforeAll(async () => {
  useMediaStorageForTests(storage);
  const [place] = await db()
    .select({ id: locations.id, path: locations.path })
    .from(locations)
    .where(eq(locations.level, 'city'))
    .orderBy(locations.code)
    .limit(1);
  placeId = place!.id;
  const [country] = await db()
    .select({ currency: locations.currencyCode })
    .from(locations)
    .where(and(eq(locations.level, 'country'), inArray(locations.code, place!.path)));
  placeCurrency = country!.currency!;
});

beforeEach(async () => {
  await resetTransactionalData();
  storage.objects.clear();
});

afterAll(async () => {
  useMediaStorageForTests(null);
  await closeDb();
});

describe('image pipeline', () => {
  it('identifies files by their bytes, not their name', async () => {
    expect(sniffImageType(await jpeg(1))).toBe('image/jpeg');
    expect(sniffImageType(await sharp(await jpeg(1)).png().toBuffer())).toBe('image/png');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('re-encodes to WebP and drops every piece of metadata', async () => {
    const source = await jpeg(3, true);
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const processed = await processImage(source);
    const meta = await sharp(processed.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(processed.body.includes(Buffer.from('secret-owner'))).toBe(false);
  });

  it('refuses a file that only pretends to be an image', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not really a jpeg')]);
    await expect(processImage(fake)).rejects.toMatchObject({ messageKey: 'media.error.unreadable' });
    await expect(processImage(Buffer.from('hello'))).rejects.toMatchObject({
      messageKey: 'media.error.unsupported_type',
    });
  });

  it('shrinks large photos to the stored maximum', async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#336699' } })
      .jpeg()
      .toBuffer();
    const processed = await processImage(big);
    expect(Math.max(processed.width, processed.height)).toBe(1600);
  });
});

describe('input rules', () => {
  it('reads prices written either way', () => {
    expect(parsePriceToMinor('1500')).toBe(150_000);
    expect(parsePriceToMinor('1,500.50')).toBe(150_050);
    expect(parsePriceToMinor('1500,50')).toBe(150_050);
    expect(parsePriceToMinor('12.5')).toBe(1250);
    expect(parsePriceToMinor('-3')).toBeNull();
    expect(parsePriceToMinor('abc')).toBeNull();
  });

  it('accepts only international phone numbers', () => {
    expect(normalizeWhatsapp('+505 8888-8888')).toBe('+50588888888');
    expect(normalizeWhatsapp('8888 8888')).toBeNull();
  });
});

describe('publishing', () => {
  it('charges one token, stores the listing and audits it', async () => {
    const seller = await createMember({ tokens: 2 });
    const { listingId } = await publish(seller);

    expect(await getBalance(db(), seller)).toBe(1);
    const listing = await getListing(db(), listingId, 'es');
    expect(listing?.status).toBe('published');
    expect(listing?.photos).toHaveLength(1);

    const [audit] = await db()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'mercadito.listing_published'));
    expect(audit?.subjectId).toBe(listingId);

    const image = await readActiveImage(db(), listing!.photos[0]!.mediaId);
    expect(image?.contentType).toBe('image/webp');
  });

  it('never charges twice for a retried submission', async () => {
    const seller = await createMember({ tokens: 4 });
    const listingId = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const images = await storeImages({ ownerUserId: seller, purpose: 'listing_photo', files: [await jpeg(5)] });
      const result = await db().transaction((tx) =>
        publishListing(tx, { listingId, sellerUserId: seller, input: input(), images }),
      );
      expect(result.deduplicated).toBe(attempt === 1);
    }
    expect(await getBalance(db(), seller)).toBe(3);
  });

  it('rolls everything back when the seller has no tokens', async () => {
    const seller = await createMember({ tokens: 2 });
    await publish(seller, 1);
    await publish(seller, 2);
    await expect(publish(seller, 3)).rejects.toMatchObject({ code: 'insufficient_tokens' });

    const rows = await db().select().from(mercaditoListings).where(eq(mercaditoListings.sellerUserId, seller));
    expect(rows).toHaveLength(2);
    const mediaRows = await db().select().from(media).where(eq(media.ownerUserId, seller));
    expect(mediaRows).toHaveLength(2);
  });

  it('holds a new account to three listings', async () => {
    const seller = await createMember({ tokens: 6 });
    for (let seed = 1; seed <= 3; seed += 1) await publish(seller, seed, { title: `Artículo número ${seed}` });
    await expect(publish(seller, 4, { title: 'Artículo número 4' })).rejects.toMatchObject({
      messageKey: 'mercadito.error.new_seller_limit',
    });
    const standing = await sellerStanding(db(), seller);
    expect(standing.allowed).toBe(false);
    expect(await getBalance(db(), seller)).toBe(3);
  });

  it('lifts the limit once the account is a week old', async () => {
    const seller = await createMember({ ageDays: 8, tokens: 8 });
    for (let seed = 1; seed <= 4; seed += 1) await publish(seller, seed, { title: `Artículo número ${seed}` });
    expect((await sellerStanding(db(), seller)).allowed).toBe(true);
  });

  it('refuses accounts that have not verified their email', async () => {
    const seller = await createMember({ tokens: 2 });
    await db().update(users).set({ status: 'pending_verification' }).where(eq(users.id, seller));
    await expect(publish(seller)).rejects.toMatchObject({ messageKey: 'mercadito.error.verify_email' });
  });

  it('refuses a currency foreign to the listing country', async () => {
    const seller = await createMember({ tokens: 2 });
    const other = placeCurrency === 'EUR' ? 'JPY' : 'EUR';
    await expect(publish(seller, 1, { currency: other })).rejects.toMatchObject({
      messageKey: 'mercadito.error.currency',
    });
  });

  it('flags the same photograph posted by a second seller', async () => {
    const first = await createMember({ tokens: 2 });
    const second = await createMember({ tokens: 2 });
    await publish(first, 9);
    const { listingId } = await publish(second, 9);

    const listing = await getListing(db(), listingId, 'es');
    expect(listing?.flags).toContain('duplicate_photo');
    const [ticket] = await db().select().from(tickets).where(eq(tickets.subjectId, listingId));
    expect(ticket?.status).toBe('open');
  });
});

describe('editing and closing', () => {
  it('lets the seller change details and photos, free of charge', async () => {
    const seller = await createMember({ tokens: 2 });
    const { listingId, images } = await publish(seller);
    const added = await storeImages({ ownerUserId: seller, purpose: 'listing_photo', files: [await jpeg(20)] });

    const result = await db().transaction((tx) =>
      updateListing(tx, {
        listingId,
        sellerUserId: seller,
        input: input({ title: 'Bicicleta rebajada', price: '1200' }),
        keepMediaIds: [],
        newImages: added,
      }),
    );

    expect(result.droppedStorageKeys).toEqual([images[0]!.storageKey]);
    const listing = await getListing(db(), listingId, 'es');
    expect(listing?.title).toBe('Bicicleta rebajada');
    expect(listing?.priceMinor).toBe(120_000);
    expect(listing?.photos.map((photo) => photo.mediaId)).toEqual([added[0]!.id]);
    expect(await readActiveImage(db(), images[0]!.id)).toBeNull();
    expect(await getBalance(db(), seller)).toBe(1);
  });

  it('keeps other members out of a listing', async () => {
    const seller = await createMember({ tokens: 2 });
    const stranger = await createMember();
    const { listingId } = await publish(seller);
    await expect(
      db().transaction((tx) => closeListing(tx, { listingId, sellerUserId: stranger, outcome: 'withdrawn' })),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('takes a sold listing out of the market', async () => {
    const seller = await createMember({ tokens: 2 });
    const { listingId } = await publish(seller);
    await db().transaction((tx) => closeListing(tx, { listingId, sellerUserId: seller, outcome: 'sold' }));
    const browse = await browseListings(db(), { locale: 'es' });
    expect(browse.items.map((item) => item.id)).not.toContain(listingId);
  });
});

describe('live activity', () => {
  it('stops announcing a listing once it is withdrawn', async () => {
    const { recentActivity } = await import('@/server/domains/notifications/activity');
    const seller = await createMember({ tokens: 2 });
    const { listingId } = await publish(seller);
    expect((await recentActivity(db())).map((item) => item.kind)).toEqual(['listing_published']);

    await db().transaction((tx) => closeListing(tx, { listingId, sellerUserId: seller, outcome: 'withdrawn' }));
    expect(await recentActivity(db())).toEqual([]);
  });
});

describe('browsing', () => {
  it('lists sellers buyers can reach before those they cannot', async () => {
    const quiet = await createMember({ tokens: 2 });
    const reachable = await createMember({ tokens: 2 });
    await db().transaction((tx) => setWhatsapp(tx, { userId: reachable, phoneE164: '+50588888888' }));
    const { listingId: quietListing } = await publish(quiet, 1, { title: 'Mesa de madera' });
    const { listingId: reachableListing } = await publish(reachable, 2, { title: 'Silla de madera' });

    const browse = await browseListings(db(), { locale: 'es' });
    expect(browse.items.map((item) => item.id)).toEqual([reachableListing, quietListing]);

    const search = await browseListings(db(), { locale: 'es', query: 'mesa' });
    expect(search.items.map((item) => item.id)).toEqual([quietListing]);

    const escaped = await browseListings(db(), { locale: 'es', query: '%' });
    expect(escaped.items).toHaveLength(0);
  });
});

describe('trust on every card and public profiles', () => {
  it('carries the seller\'s trust on each card', async () => {
    const seller = await createMember({ tokens: 2 });
    await publish(seller);
    const [card] = (await browseListings(db(), { locale: 'es' })).items;
    expect(card?.trust.score).toBe(REPUTATION_RULES.initialScore);
    expect(card?.trust.statusKey).toMatch(/^trust\.status\./);
    expect(card?.trust.identityVerified).toBe(false);
  });

  it('shows others only what is up or sold, and hides banned members', async () => {
    const { findPublicMember } = await import('@/server/domains/identity/profile');
    const seller = await createMember({ tokens: 4 });
    const { listingId: kept } = await publish(seller, 1, { title: 'Mesa de pino' });
    const { listingId: gone } = await publish(seller, 2, { title: 'Silla de pino' });
    await db().transaction((tx) => closeListing(tx, { listingId: gone, sellerUserId: seller, outcome: 'withdrawn' }));

    const publicCards = await sellerListings(db(), seller, 'es', { publicOnly: true });
    expect(publicCards.map((card) => card.id)).toEqual([kept]);
    expect((await sellerListings(db(), seller, 'es')).length).toBe(2);

    const [row] = await db().select({ yayId: users.yayId }).from(users).where(eq(users.id, seller));
    expect((await findPublicMember(db(), `YAY-${row!.yayId}`))?.userId).toBe(seller);
    expect(await findPublicMember(db(), 'not-an-id')).toBeNull();

    await db().update(users).set({ status: 'banned' }).where(eq(users.id, seller));
    expect(await findPublicMember(db(), row!.yayId)).toBeNull();
  });
});

describe('reserving, similar listings and saved searches', () => {
  it('keeps a reserved listing up, and lets the seller release it', async () => {
    const { setReserved } = await import('@/server/domains/mercadito/service');
    const seller = await createMember({ tokens: 2 });
    const { listingId } = await publish(seller);
    await db().transaction((tx) => setReserved(tx, { listingId, sellerUserId: seller, reserved: true }));
    const browse = await browseListings(db(), { locale: 'es' });
    expect(browse.items.find((item) => item.id === listingId)?.status).toBe('reserved');
    await expect(
      db().transaction((tx) => setReserved(tx, { listingId, sellerUserId: seller, reserved: true })),
    ).rejects.toMatchObject({ code: 'conflict' });
    await db().transaction((tx) => setReserved(tx, { listingId, sellerUserId: seller, reserved: false }));
    expect((await getListing(db(), listingId, 'es'))?.status).toBe('published');
  });

  it('suggests other open listings in the same category', async () => {
    const { similarListings } = await import('@/server/domains/mercadito/service');
    const seller = await createMember({ tokens: 6 });
    const { listingId: a } = await publish(seller, 1, { title: 'Bicicleta roja' });
    const { listingId: b } = await publish(seller, 2, { title: 'Bicicleta azul' });
    await publish(seller, 3, { title: 'Sofá de tres plazas', category: 'home' });
    const similar = await similarListings(db(), { listingId: a, category: 'sports', locale: 'es' });
    expect(similar.map((card) => card.id)).toEqual([b]);
  });

  it('counts only listings published since the search was last opened', async () => {
    const { saveSearch, listSavedSearches, markSavedSearchSeen } = await import('@/server/domains/mercadito/service');
    const buyer = await createMember();
    const seller = await createMember({ tokens: 4 });
    const id = await db().transaction((tx) => saveSearch(tx, { userId: buyer, query: 'bicicleta' }));
    const again = await db().transaction((tx) => saveSearch(tx, { userId: buyer, query: 'bicicleta' }));
    expect(again).toBe(id);
    await expect(db().transaction((tx) => saveSearch(tx, { userId: buyer }))).rejects.toMatchObject({
      messageKey: 'mercadito.saved.error.empty',
    });

    await publish(seller, 1, { title: 'Bicicleta de ruta' });
    await publish(seller, 2, { title: 'Mesa de comedor', category: 'home' });
    expect((await listSavedSearches(db(), buyer))[0]?.newCount).toBe(1);

    await markSavedSearchSeen(db(), { userId: buyer, id });
    expect((await listSavedSearches(db(), buyer))[0]?.newCount).toBe(0);
    // Another member cannot reset someone else's search.
    await markSavedSearchSeen(db(), { userId: seller, id });
  });
});

describe('reports and moderation', () => {
  it('collects reports under one ticket and lets a moderator remove and warn', async () => {
    const seller = await createMember({ tokens: 2 });
    const buyerA = await createMember();
    const buyerB = await createMember();
    const moderator = await createMember();
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    const { listingId } = await publish(seller);

    const first = await db().transaction((tx) =>
      reportListing(tx, { listingId, reporterUserId: buyerA, category: 'scam', description: 'Pide adelanto' }),
    );
    const second = await db().transaction((tx) =>
      reportListing(tx, { listingId, reporterUserId: buyerB, category: 'fake_listing', description: null }),
    );
    expect(second.ticketCode).toBe(first.ticketCode);

    const again = await db().transaction((tx) =>
      reportListing(tx, { listingId, reporterUserId: buyerA, category: 'scam', description: null }),
    );
    expect(again.duplicate).toBe(true);

    await expect(
      db().transaction((tx) => reportListing(tx, { listingId, reporterUserId: seller, category: 'spam', description: null })),
    ).rejects.toMatchObject({ messageKey: 'mercadito.report.error.own' });

    // A member without the permission sees no queue and can decide nothing.
    await expect(listingQueue(db(), { userId: buyerA, status: 'active' })).rejects.toMatchObject({ code: 'forbidden' });

    const queue = await listingQueue(db(), { userId: moderator, status: 'active' });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.reportCount).toBe(2);
    expect(queue[0]?.priority).toBe('high');

    await expect(
      db().transaction((tx) =>
        resolveListingTicket(tx, {
          actor: { userId: buyerA, status: 'active' },
          ticketId: queue[0]!.ticketId,
          decision: 'remove',
          note: null,
        }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await db().transaction((tx) =>
      resolveListingTicket(tx, {
        actor: { userId: moderator, status: 'active' },
        ticketId: queue[0]!.ticketId,
        decision: 'warn',
        note: 'Pedía pago por adelantado',
      }),
    );

    const listing = await getListing(db(), listingId, 'es');
    expect(listing?.status).toBe('removed');
    expect(listing?.photos).toHaveLength(0);

    const [score] = await db().select().from(reputationScores).where(eq(reputationScores.userId, seller));
    expect(score?.score).toBeLessThan(REPUTATION_RULES.initialScore);
    const warnings = await db().select().from(enforcementRecords).where(eq(enforcementRecords.userId, seller));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type).toBe('warning');

    expect(await listingQueue(db(), { userId: moderator, status: 'active' })).toHaveLength(0);

    const [audit] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'moderation.listing_warn'));
    expect(audit?.actorUserId).toBe(moderator);
  });

  it('dismisses a report without touching the listing', async () => {
    const seller = await createMember({ tokens: 2 });
    const buyer = await createMember();
    const moderator = await createMember();
    await db().transaction((tx) => grantRole(tx, { userId: moderator, roleKey: 'moderator', grantedBy: null }));
    const { listingId } = await publish(seller);
    await db().transaction((tx) =>
      reportListing(tx, { listingId, reporterUserId: buyer, category: 'other', description: null }),
    );
    const [item] = await listingQueue(db(), { userId: moderator, status: 'active' });
    await db().transaction((tx) =>
      resolveListingTicket(tx, {
        actor: { userId: moderator, status: 'active' },
        ticketId: item!.ticketId,
        decision: 'dismiss',
        note: null,
      }),
    );
    expect((await getListing(db(), listingId, 'es'))?.status).toBe('published');
    const [ticket] = await db().select().from(tickets).where(eq(tickets.id, item!.ticketId));
    expect(ticket?.status).toBe('rejected');
  });
});

describe('the media storage capability', () => {
  const original = { ...process.env };

  async function state(overrides: Record<string, string | undefined>) {
    process.env = { ...original, ...overrides };
    const { resetServerEnvCache } = await import('@/config/env');
    resetServerEnvCache();
    const { allCapabilities } = await import('@/server/domains/platform/capability');
    return allCapabilities().find((capability) => capability.key === 'media_storage')?.state;
  }

  afterAll(async () => {
    process.env = { ...original };
    (await import('@/config/env')).resetServerEnvCache();
  });

  it('is REAL only with every bucket credential in place', async () => {
    const full = {
      MEDIA_STORAGE_PROVIDER: 's3',
      MEDIA_S3_ENDPOINT: 'https://storage.example.test',
      MEDIA_S3_BUCKET: 'bucket',
      MEDIA_S3_ACCESS_KEY_ID: 'key',
      MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
    };
    expect(await state(full)).toBe('REAL');
    expect(await state({ ...full, MEDIA_S3_SECRET_ACCESS_KEY: undefined })).toBe('REQUIRES_CONFIGURATION');
    expect(await state({ ...full, MEDIA_STORAGE_PROVIDER: 'unconfigured' })).toBe('REQUIRES_CONFIGURATION');
  });
});
