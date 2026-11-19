import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import { featureFlags, locations, media, mercaditoListingPhotos, mercaditoListings, roxiDrafts, roxiHelpDaily, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { setLook } from '@/server/domains/platform/looks';
import { readActiveImage, storeImages } from '@/server/domains/media/service';
import { useMediaStorageForTests, type MediaStorage } from '@/server/domains/media/storage';
import { publishListing, publishReceipt } from '@/server/domains/mercadito/service';
import { listingInputSchema } from '@/server/domains/mercadito/rules';
import {
  claimDraftForPublish,
  cleanListingFields,
  createListingDraft,
  discardListingDraft,
  expireListingDrafts,
  getListingDraft,
  markListingDraftOpened,
  readDraftPhoto,
  ROXI_DRAFT_PURPOSE,
  roxiReviewOn,
  updateListingDraft,
} from '@/server/domains/roxi/drafts';
import { MERCADITO_RULES, ROXI_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';
import { errorHasCode } from '../helpers/errors';

/**
 * The listing flagship's first slice (docs/roxi/FLAGSHIP.md): drafts Roxi
 * keeps on the server, their private photos, publishing one from the real
 * form (once, however often it is sent), the receipt, and the switch.
 */
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
const context = { networkHash: null, addressHash: 'roxi-drafts-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;
let placeCurrency: string;

async function jpeg(seed: number): Promise<Buffer> {
  return sharp({ create: { width: 64 + seed, height: 48, channels: 3, background: { r: (seed * 37) % 255, g: 90, b: 140 } } })
    .jpeg()
    .toBuffer();
}

async function member(options: { admin?: boolean } = {}) {
  const { userId } = await register(
    db(),
    { email: `draft-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vendedora', locale: 'es', acceptedTerms: true },
    context,
  );
  // Old enough to be past the new-seller limit, which is not what these tests are about.
  await db().update(users).set({ status: 'active', createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(users.id, userId));
  if (options.admin) await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  return userId;
}

async function photos(userId: string, seeds: number[]) {
  return storeImages({ ownerUserId: userId, purpose: ROXI_DRAFT_PURPOSE, files: await Promise.all(seeds.map(jpeg)) });
}

async function counted(event: string): Promise<number> {
  const rows = await db().select({ count: roxiHelpDaily.count }).from(roxiHelpDaily).where(eq(roxiHelpDaily.event, event));
  return rows.reduce((sum, row) => sum + row.count, 0);
}

const fields = () => ({ title: 'Bicicleta de montaña', description: 'Rodado 29, frenos de disco, poco uso.', price: '1500', category: 'sports', condition: 'used', locationId: placeId });

const input = () =>
  listingInputSchema.parse({ ...fields(), currency: placeCurrency });

async function publishDraft(userId: string, draftId: string, keep: string[]) {
  return db().transaction(async (tx) => {
    const claimed = await claimDraftForPublish(tx, { userId, draftId, keepPhotoIds: keep });
    const result = await publishListing(tx, { listingId: draftId, sellerUserId: userId, input: input(), images: [], attachedImages: claimed.images, assistedBy: 'roxi' });
    return { ...result, dropped: claimed.dropped };
  });
}

beforeAll(async () => {
  useMediaStorageForTests(storage);
  const [place] = await db().select({ id: locations.id, path: locations.path }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  placeId = place!.id;
  const [country] = await db()
    .select({ currency: locations.currencyCode })
    .from(locations)
    .where(and(eq(locations.level, 'country'), inArray(locations.code, place!.path)));
  placeCurrency = country!.currency!;
});

beforeEach(async () => {
  await resetTransactionalData();
  await db().delete(roxiHelpDaily);
  clearSettingsCache();
  storage.objects.clear();
});
afterAll(closeDb);

describe('A listing draft Roxi keeps', () => {
  it("holds only what the form takes, and an unfinished draft is allowed", () => {
    expect(cleanListingFields({ title: '  Mesa   de pino ', price: 'C$ 1,500', category: 'furniture', condition: 'used', locationId: 'Managua', extra: 'x' })).toEqual({
      title: 'Mesa de pino',
      price: '1,500',
      condition: 'used',
    });
    expect(cleanListingFields({ title: 'x'.repeat(200) }).title).toHaveLength(MERCADITO_RULES.titleMaxLength);
  });

  it('keeps its photos private: its owner sees them, the public route and other members do not', async () => {
    const seller = await member();
    const other = await member();
    const images = await photos(seller, [1, 2]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));

    expect(draft.photoIds).toEqual(images.map((image) => image.id));
    expect(draft.expiresAt.getTime() - draft.createdAt.getTime()).toBe(ROXI_RULES.draftKeepDays * 86_400_000);
    expect(await readActiveImage(db(), images[0]!.id)).toBeNull();
    expect(await readDraftPhoto(db(), { userId: seller, mediaId: images[0]!.id })).not.toBeNull();
    expect(await readDraftPhoto(db(), { userId: other, mediaId: images[0]!.id })).toBeNull();
    expect(await getListingDraft(db(), { userId: other, id: draft.id })).toBeNull();
    expect(await counted('listing_drafted')).toBe(1);
  });

  it('is one per member: a new one replaces it, photos and all; worked on again, it keeps its photos and its id', async () => {
    const seller = await member();
    const first = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images: first }));

    const more = await photos(seller, [2]);
    const again = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: { ...fields(), title: 'Bicicleta Trek 29' }, images: more, continueId: draft.id }));
    expect(again.draft.id).toBe(draft.id);
    expect(again.draft.photoIds).toEqual([first[0]!.id, more[0]!.id]);
    expect(again.draft.fields.title).toBe('Bicicleta Trek 29');
    expect(again.dropped).toEqual([]);
    expect(await counted('listing_drafted')).toBe(1);

    const other = await photos(seller, [3]);
    const fresh = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: { title: 'Silla' }, images: other }));
    expect(fresh.draft.id).not.toBe(draft.id);
    expect(fresh.dropped.sort()).toEqual([first[0]!.storageKey, more[0]!.storageKey].sort());
    expect(await db().select().from(roxiDrafts).where(eq(roxiDrafts.userId, seller))).toHaveLength(1);
    expect(await db().select().from(media).where(inArray(media.id, [first[0]!.id, more[0]!.id]))).toHaveLength(0);
  });

  it('never holds more photos than a listing may have', async () => {
    const seller = await member();
    const images = await photos(seller, Array.from({ length: MERCADITO_RULES.maxPhotos }, (_, i) => i + 1));
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    const extra = await photos(seller, [99]);
    await expect(db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images: extra, continueId: draft.id }))).rejects.toSatisfy((error: unknown) => errorHasCode(error, 'validation_failed'));
    // Refused as a whole: the draft is as it was.
    expect((await getListingDraft(db(), { userId: seller }))!.photoIds).toHaveLength(MERCADITO_RULES.maxPhotos);
  });

  it("takes the member's own edits on the card, and an edit gives it its full time again", async () => {
    const seller = await member();
    const images = await photos(seller, [1, 2]);
    const made = new Date(Date.now() - 3 * 86_400_000);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images, now: made }));
    const { draft: edited, dropped } = await db().transaction((tx) =>
      updateListingDraft(tx, { userId: seller, id: draft.id, fields: { price: '1300', description: '' }, removePhotoIds: [images[1]!.id] }),
    );
    expect(edited.fields).toMatchObject({ title: 'Bicicleta de montaña', price: '1300' });
    expect(edited.fields.description).toBeUndefined();
    expect(edited.photoIds).toEqual([images[0]!.id]);
    expect(dropped).toEqual([images[1]!.storageKey]);
    expect(edited.expiresAt.getTime()).toBeGreaterThan(draft.expiresAt.getTime());
    // Someone else's draft cannot be touched.
    const other = await member();
    await expect(db().transaction((tx) => updateListingDraft(tx, { userId: other, id: draft.id, fields: { price: '1' } }))).rejects.toSatisfy((error: unknown) => errorHasCode(error, 'not_found'));
    await expect(db().transaction((tx) => discardListingDraft(tx, { userId: other, id: draft.id }))).rejects.toSatisfy((error: unknown) => errorHasCode(error, 'not_found'));
  });

  it('counts the form opened from it once, however often the page reloads', async () => {
    const seller = await member();
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images: [] }));
    await db().transaction((tx) => markListingDraftOpened(tx, { userId: seller, id: draft.id }));
    await db().transaction((tx) => markListingDraftOpened(tx, { userId: seller, id: draft.id }));
    expect(await counted('listing_opened')).toBe(1);
  });

  it('goes when its time has passed, photos and all', async () => {
    const seller = await member();
    const images = await photos(seller, [1]);
    const old = new Date(Date.now() - (ROXI_RULES.draftKeepDays + 1) * 86_400_000);
    await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images, now: old }));
    expect(await getListingDraft(db(), { userId: seller })).toBeNull();
    const result = await db().transaction((tx) => expireListingDrafts(tx));
    expect(result).toEqual({ expired: 1, dropped: [images[0]!.storageKey] });
    expect(await db().select().from(roxiDrafts)).toHaveLength(0);
    expect(await db().select().from(media).where(eq(media.id, images[0]!.id))).toHaveLength(0);
  });
});

describe('Publishing a draft from the form', () => {
  it('moves the photos the member kept to the listing, drops the rest, and ends the draft', async () => {
    const seller = await member();
    const images = await photos(seller, [1, 2, 3]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));

    const result = await publishDraft(seller, draft.id, [images[2]!.id, images[0]!.id]);
    expect(result).toMatchObject({ listingId: draft.id, deduplicated: false });
    expect(result.dropped).toEqual([images[1]!.storageKey]);

    // In the draft's order, now public listing photos.
    const listed = await db().select().from(mercaditoListingPhotos).where(eq(mercaditoListingPhotos.listingId, draft.id)).orderBy(mercaditoListingPhotos.position);
    expect(listed.map((row) => row.mediaId)).toEqual([images[0]!.id, images[2]!.id]);
    expect(await readActiveImage(db(), images[0]!.id)).not.toBeNull();
    expect(await readDraftPhoto(db(), { userId: seller, mediaId: images[0]!.id })).toBeNull();
    expect(await getListingDraft(db(), { userId: seller })).toBeNull();
    expect(await counted('listing_published')).toBe(1);
  });

  it('publishes once, however often it is sent: another tab, another device, a second tap', async () => {
    const seller = await member();
    const images = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    await publishDraft(seller, draft.id, [images[0]!.id]);
    const second = await publishDraft(seller, draft.id, [images[0]!.id]);
    expect(second).toMatchObject({ listingId: draft.id, deduplicated: true, cost: 0 });
    expect(await db().select().from(mercaditoListings).where(eq(mercaditoListings.sellerUserId, seller))).toHaveLength(1);
    expect(await counted('listing_published')).toBe(1);
  });

  it('is refused once the draft is gone and was never published, and says so', async () => {
    const seller = await member();
    const images = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    await db().transaction((tx) => discardListingDraft(tx, { userId: seller, id: draft.id }));
    await expect(publishDraft(seller, draft.id, [])).rejects.toSatisfy((error: unknown) => errorHasCode(error, 'conflict'));
  });

  it('leaves the draft exactly as it was when the publish is refused', async () => {
    const seller = await member();
    const images = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    // A currency that is not the place's: the server refuses the listing after the draft was claimed.
    await expect(
      db().transaction(async (tx) => {
        const claimed = await claimDraftForPublish(tx, { userId: seller, draftId: draft.id, keepPhotoIds: [images[0]!.id] });
        await publishListing(tx, { listingId: draft.id, sellerUserId: seller, input: { ...input(), currency: placeCurrency === 'XYZ' ? 'ABC' : 'XYZ' }, images: [], attachedImages: claimed.images });
      }),
    ).rejects.toThrow();
    expect((await getListingDraft(db(), { userId: seller }))!.photoIds).toEqual([images[0]!.id]);
    expect(await readDraftPhoto(db(), { userId: seller, mediaId: images[0]!.id })).not.toBeNull();
    expect(await counted('listing_published')).toBe(0);
  });

  it('never hands one member another member\'s draft photos', async () => {
    const seller = await member();
    const thief = await member();
    const images = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    await expect(publishDraft(thief, draft.id, [images[0]!.id])).rejects.toSatisfy((error: unknown) => errorHasCode(error, 'conflict'));
    expect((await getListingDraft(db(), { userId: seller }))!.photoIds).toEqual([images[0]!.id]);
  });
});

describe("Roxi's receipt", () => {
  it('says what publishing came to, from the record of the publish, to the seller only', async () => {
    const seller = await member();
    const images = await photos(seller, [1]);
    const { draft } = await db().transaction((tx) => createListingDraft(tx, { userId: seller, fields: fields(), images }));
    await publishDraft(seller, draft.id, [images[0]!.id]);

    const receipt = await publishReceipt(db(), { sellerUserId: seller, listingId: draft.id });
    expect(receipt).toMatchObject({ id: draft.id, title: 'Bicicleta de montaña', priceMinor: 150_000, currencyCode: placeCurrency, cost: 0, assistedByRoxi: true, openNow: 1 });
    expect(receipt!.freeOpenListings).toBeGreaterThanOrEqual(1);
    expect(await publishReceipt(db(), { sellerUserId: await member(), listingId: draft.id })).toBeNull();
  });
});

describe('The flagship switch', () => {
  it('is off for members until the owner turns it on, and the owner always has it', async () => {
    const owner = await member({ admin: true });
    const neighbour = await member();
    expect(await roxiReviewOn(db(), neighbour)).toBe(false);
    expect(await roxiReviewOn(db(), owner)).toBe(true);
    try {
      await db().transaction((tx) => setLook(tx, { actor: { userId: owner, status: 'active' }, key: 'roxi_review', enabled: true }));
      clearSettingsCache();
      expect(await roxiReviewOn(db(), neighbour)).toBe(true);
    } finally {
      // Switches outlive the per-test reset: left on, every later test and local run would have the flagship.
      await db().delete(featureFlags).where(eq(featureFlags.key, 'roxi.review'));
      clearSettingsCache();
    }
  });
});
