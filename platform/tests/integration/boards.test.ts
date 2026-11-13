import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, ne, and, notLike } from 'drizzle-orm';
import sharp from 'sharp';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, boardPosts, locations, notifications, userProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { BOARD_DISTRICTS, BOARD_DISTRICT_KEYS } from '@/config/boards';
import { BOARD_RULES } from '@/config/business-rules';
import { alertHref, boardInputSchema, deleteBoardAlert, markBoardAlertSeen, myBoardAlerts, saveBoardAlert, boardQueue, closeBoardPost, createBoardPost, getBoardPost, listBoardPosts, myBoardPosts, reportBoardPost, resolveBoardTicket, subdistrictCounts, nearbyBoardPosts, placePoint } from '@/server/domains/boards/service';
import { resetTransactionalData } from '../helpers/database';
import { whatsappLookup } from '@/server/domains/whatsapp/lookup';
import { readActiveImage, storeImages } from '@/server/domains/media/service';
import { useMediaStorageForTests, type MediaStorage } from '@/server/domains/media/storage';

/**
 * The six board districts: a member publishes what they offer or look for in
 * a subdistrict; anyone reads it; only members see how to reach the author;
 * reports reach moderators, who can take a post down.
 */

const context = { networkHash: null, addressHash: 'boards-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId = '';
let placeCode = '';
let elsewhere = { id: '', code: '' };

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
const jpeg = (seed: number) => sharp({ create: { width: 64 + seed, height: 48, channels: 3, background: { r: seed, g: 90, b: 140 } } }).jpeg().toBuffer();

async function person(options: { role?: 'moderator'; status?: 'active' | 'pending_verification' } = {}) {
  const { userId } = await register(
    db(),
    { email: `board-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  const status = options.status ?? 'active';
  await db().update(users).set({ status }).where(eq(users.id, userId));
  if (options.role) await db().transaction((tx) => grantRole(tx, { userId, roleKey: options.role!, grantedBy: null }));
  return { userId, status };
}

const input = (overrides: Record<string, string> = {}) =>
  boardInputSchema.parse({
    district: 'hogar',
    subdistrict: 'rentals',
    kind: 'offer',
    title: 'Casa de dos cuartos en alquiler',
    body: 'Casa con patio, agua todo el día y cerca de la parada de buses.',
    priceText: 'C$ 5,500 al mes',
    locationId: placeId,
    ...overrides,
  });

const publish = (authorUserId: string, overrides: Record<string, string> = {}) => db().transaction((tx) => createBoardPost(tx, { authorUserId, input: input(overrides) }));

beforeAll(async () => {
  useMediaStorageForTests(storage);
  const [place] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  placeId = place!.id;
  placeCode = place!.code;
  // A city in another country: outside the first one's department and country alike.
  const country = placeCode.split('.').slice(0, 2).join('.');
  const [other] = await db()
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(and(eq(locations.level, 'city'), ne(locations.id, placeId), notLike(locations.code, `${country}.%`)))
    .orderBy(locations.code)
    .limit(1);
  elsewhere = other!;
});

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  useMediaStorageForTests(null);
  await closeDb();
});

describe('publishing in a board district', () => {
  it('accepts every district with each of its subdistricts, and nothing outside them', () => {
    for (const district of BOARD_DISTRICT_KEYS) {
      for (const subdistrict of BOARD_DISTRICTS[district].subdistricts) {
        expect(boardInputSchema.safeParse({ ...input(), district, subdistrict, priceText: '' }).success, `${district}/${subdistrict}`).toBe(true);
      }
    }
    const wrong = boardInputSchema.safeParse({ ...input(), district: 'campo', subdistrict: 'rentals', priceText: '' });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]?.message).toBe('board.error.subdistrict');
    expect(boardInputSchema.safeParse({ ...input(), district: 'mercadito', priceText: '' }).success).toBe(false);
    expect(boardInputSchema.safeParse({ ...input(), title: 'corto', priceText: '' }).error?.issues[0]?.message).toBe('board.error.title');
  });

  it('publishes for free, audited, and shows the post to a visitor without any contact', async () => {
    const author = await person();
    const postId = await publish(author.userId);

    const feed = await listBoardPosts(db(), { district: 'hogar', locale: 'es' });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ id: postId, subdistrict: 'rentals', kind: 'offer', priceText: 'C$ 5,500 al mes', status: 'open', isAuthor: false });

    const visitor = await getBoardPost(db(), { postId, viewerId: null, locale: 'es' });
    expect(visitor?.contact).toBeNull();

    const audits = await db().select().from(auditEvents).where(eq(auditEvents.action, 'board.post_published'));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ subjectId: postId, district: 'hogar' });
  });

  it('gives a signed-in member the WhatsApp the author put on their profile, and the author none of their own', async () => {
    const author = await person();
    const reader = await person();
    const postId = await publish(author.userId);
    expect((await getBoardPost(db(), { postId, viewerId: reader.userId, locale: 'es' }))?.contact).toEqual({ whatsapp: null });

    await db().insert(userProfiles).values({ userId: author.userId, whatsappE164: '+50588881234' }).onConflictDoUpdate({ target: userProfiles.userId, set: { whatsappE164: '+50588881234' } });
    expect((await getBoardPost(db(), { postId, viewerId: reader.userId, locale: 'es' }))?.contact).toEqual({ whatsapp: '+50588881234' });
    const own = await getBoardPost(db(), { postId, viewerId: author.userId, locale: 'es' });
    expect(own).toMatchObject({ isAuthor: true, contact: null });
  });

  it('refuses an account that has not verified its email, and a place that does not exist', async () => {
    const unverified = await person({ status: 'pending_verification' });
    await expect(publish(unverified.userId)).rejects.toMatchObject({ messageKey: 'board.error.verify_email' });
    const author = await person();
    await expect(publish(author.userId, { locationId: crypto.randomUUID() })).rejects.toMatchObject({ messageKey: 'board.error.location' });
  });

  it('holds a member to the open-post limit per district, not across districts', async () => {
    const author = await person();
    for (let i = 0; i < BOARD_RULES.maxOpenPerDistrict; i += 1) await publish(author.userId, { title: `Cuarto en alquiler número ${i}` });
    await expect(publish(author.userId)).rejects.toMatchObject({ messageKey: 'board.error.too_many_open' });
    await expect(publish(author.userId, { district: 'campo', subdistrict: 'harvest' })).resolves.toBeTypeOf('string');
  });
});

describe('browsing', () => {
  it('filters by subdistrict, by offering or looking, and by words, and counts only open posts', async () => {
    const author = await person();
    await publish(author.userId);
    await publish(author.userId, { subdistrict: 'moving', kind: 'request', title: 'Busco camión para mudanza', body: 'Necesito mover muebles de una casa a otra este sábado.' });
    const closed = await publish(author.userId, { subdistrict: 'furniture', title: 'Ropero de madera en venta' });
    await db().transaction((tx) => closeBoardPost(tx, { postId: closed, authorUserId: author.userId }));

    expect((await listBoardPosts(db(), { district: 'hogar', locale: 'es' })).items).toHaveLength(2);
    expect((await listBoardPosts(db(), { district: 'hogar', subdistrict: 'moving', locale: 'es' })).items.map((p) => p.kind)).toEqual(['request']);
    expect((await listBoardPosts(db(), { district: 'hogar', kind: 'offer', locale: 'es' })).items).toHaveLength(1);
    expect((await listBoardPosts(db(), { district: 'hogar', query: 'camión', locale: 'es' })).items).toHaveLength(1);
    expect((await listBoardPosts(db(), { district: 'hogar', query: '100%', locale: 'es' })).items).toHaveLength(0);
    expect((await listBoardPosts(db(), { district: 'campo', locale: 'es' })).items).toHaveLength(0);
    expect(await subdistrictCounts(db(), 'hogar')).toEqual({ rentals: 1, moving: 1 });
  });

  it('drops a post from the public pages when its time runs out, but keeps it for its author', async () => {
    const author = await person();
    const postId = await publish(author.userId);
    await db().update(boardPosts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(boardPosts.id, postId));
    expect((await listBoardPosts(db(), { district: 'hogar', locale: 'es' })).items).toHaveLength(0);
    expect(await getBoardPost(db(), { postId, viewerId: null, locale: 'es' })).toBeNull();
    expect(await getBoardPost(db(), { postId, viewerId: author.userId, locale: 'es' })).toMatchObject({ expired: true });
    expect(await myBoardPosts(db(), { district: 'hogar', userId: author.userId, locale: 'es' })).toHaveLength(1);
  });
});

describe('places and photos', () => {
  it('filters by place, and a wider place includes the towns inside it', async () => {
    const author = await person();
    await publish(author.userId);
    await publish(author.userId, { locationId: elsewhere.id, title: 'Casa en otra ciudad lejana' });
    const here = await listBoardPosts(db(), { district: 'hogar', placeCode, locale: 'es' });
    expect(here.items.map((p) => p.title)).toEqual(['Casa de dos cuartos en alquiler']);
    const country = placeCode.split('.').slice(0, 2).join('.');
    expect((await listBoardPosts(db(), { district: 'hogar', placeCode: country, locale: 'es' })).items).toHaveLength(1);
    expect((await listBoardPosts(db(), { district: 'hogar', placeCode: elsewhere.code, locale: 'es' })).items.map((p) => p.title)).toEqual(['Casa en otra ciudad lejana']);
    expect((await listBoardPosts(db(), { district: 'hogar', placeCode: 'zz.nowhere', locale: 'es' })).items).toHaveLength(0);
  });

  it('keeps a post\u2019s photos in order, serves them while it is open, and stops when it is closed', async () => {
    const author = await person();
    const images = await storeImages({ ownerUserId: author.userId, purpose: 'board_photo', files: [await jpeg(1), await jpeg(2)] });
    const postId = await db().transaction((tx) => createBoardPost(tx, { authorUserId: author.userId, input: input(), images }));
    const post = await getBoardPost(db(), { postId, viewerId: null, locale: 'es' });
    expect(post?.photoIds).toEqual(images.map((image) => image.id));
    expect((await listBoardPosts(db(), { district: 'hogar', locale: 'es' })).items[0]?.photoIds).toHaveLength(2);
    expect(await readActiveImage(db(), images[0]!.id)).not.toBeNull();

    await db().transaction((tx) => closeBoardPost(tx, { postId, authorUserId: author.userId }));
    expect(await readActiveImage(db(), images[0]!.id)).toBeNull();
    expect((await getBoardPost(db(), { postId, viewerId: author.userId, locale: 'es' }))?.photoIds).toEqual([]);
  });

  it('refuses more photos than the limit', async () => {
    const author = await person();
    const files = await Promise.all(Array.from({ length: BOARD_RULES.maxPhotos + 1 }, (_, i) => jpeg(i + 1)));
    const images = await storeImages({ ownerUserId: author.userId, purpose: 'board_photo', files });
    await expect(db().transaction((tx) => createBoardPost(tx, { authorUserId: author.userId, input: input(), images }))).rejects.toMatchObject({ messageKey: 'board.error.photo_count' });
  });
});

describe('Avísame', () => {
  const filters = (over: Record<string, string | null> = {}) => ({ district: 'hogar' as const, subdistrict: 'rentals', kind: null, query: null, placeCode: null, ...over });
  const told = (userId: string) => db().select().from(notifications).where(eq(notifications.userId, userId));

  it('tells the member whose alert a new post matches, once a day, and never its author', async () => {
    const author = await person();
    const watcher = await person();
    const other = await person();
    const id = await db().transaction((tx) => saveBoardAlert(tx, { userId: watcher.userId, filters: filters() }));
    await db().transaction((tx) => saveBoardAlert(tx, { userId: other.userId, filters: filters({ subdistrict: 'moving' }) }));
    await db().transaction((tx) => saveBoardAlert(tx, { userId: author.userId, filters: filters() }));

    await publish(author.userId);
    const first = await told(watcher.userId);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ category: 'districts', titleKey: 'notify.board.alert_match' });
    expect(first[0]?.href).toBe(alertHref({ ...filters(), id }));
    expect(await told(other.userId)).toHaveLength(0);
    expect(await told(author.userId)).toHaveLength(0);

    await publish(author.userId, { title: 'Otra casa en alquiler hoy' });
    expect(await told(watcher.userId)).toHaveLength(1);
  });

  it('matches words and place, counts what is new since the alert was opened, and can be removed', async () => {
    const author = await person();
    const watcher = await person();
    const country = placeCode.split('.').slice(0, 2).join('.');
    const id = await db().transaction((tx) => saveBoardAlert(tx, { userId: watcher.userId, filters: filters({ subdistrict: null, query: 'patio', placeCode: country }) }));
    // The same filters again are the same alert.
    expect(await db().transaction((tx) => saveBoardAlert(tx, { userId: watcher.userId, filters: filters({ subdistrict: null, query: 'patio', placeCode: country }) }))).toBe(id);

    await publish(author.userId);
    await publish(author.userId, { title: 'Casa sin jardín en otra parte', body: 'Dos cuartos y sala amplia, cerca del mercado central.' });
    await publish(author.userId, { locationId: elsewhere.id, title: 'Casa con patio en otro país' });
    const [alert] = await myBoardAlerts(db(), { userId: watcher.userId, district: 'hogar' });
    expect(alert).toMatchObject({ id, query: 'patio', newCount: 1 });

    await markBoardAlertSeen(db(), { userId: watcher.userId, id });
    expect((await myBoardAlerts(db(), { userId: watcher.userId, district: 'hogar' }))[0]?.newCount).toBe(0);
    await db().transaction((tx) => deleteBoardAlert(tx, { userId: author.userId, id }));
    expect(await myBoardAlerts(db(), { userId: watcher.userId, district: 'hogar' })).toHaveLength(1);
    await db().transaction((tx) => deleteBoardAlert(tx, { userId: watcher.userId, id }));
    expect(await myBoardAlerts(db(), { userId: watcher.userId, district: 'hogar' })).toHaveLength(0);
  });

  it('keeps a member to the limit per district', async () => {
    const watcher = await person();
    for (let i = 0; i < BOARD_RULES.maxAlertsPerDistrict; i += 1) await db().transaction((tx) => saveBoardAlert(tx, { userId: watcher.userId, filters: filters({ query: `casa ${i}` }) }));
    await expect(db().transaction((tx) => saveBoardAlert(tx, { userId: watcher.userId, filters: filters({ query: 'una más' }) }))).rejects.toMatchObject({ messageKey: 'board.error.too_many_alerts' });
  });
});

describe('Roxi', () => {
  it('can look a post up for someone on WhatsApp, with its link', async () => {
    const author = await person();
    const postId = await publish(author.userId);
    const found = JSON.parse(await whatsappLookup(db(), { scope: 'hogar', query: 'cuartos', category: 'rentals' }));
    expect(found.found).toBe(1);
    expect(found.results[0].link).toMatch(new RegExp(`/hogar/${postId}$`));
    expect(found.results[0].detail).toContain('C$ 5,500 al mes');
    expect(JSON.parse(await whatsappLookup(db(), { scope: 'campo' })).found).toBe(0);
  });
});

describe('closing, reporting and moderation', () => {
  it('lets only the author close a post, once', async () => {
    const author = await person();
    const other = await person();
    const postId = await publish(author.userId);
    await expect(db().transaction((tx) => closeBoardPost(tx, { postId, authorUserId: other.userId }))).rejects.toMatchObject({ code: 'not_found' });
    await db().transaction((tx) => closeBoardPost(tx, { postId, authorUserId: author.userId }));
    await expect(db().transaction((tx) => closeBoardPost(tx, { postId, authorUserId: author.userId }))).rejects.toMatchObject({ messageKey: 'board.error.closed' });
    expect(await getBoardPost(db(), { postId, viewerId: other.userId, locale: 'es' })).toBeNull();
  });

  it('collects reports in one case, which a moderator can dismiss or act on, and never the author or a plain member', async () => {
    const author = await person();
    const reporter = await person();
    const second = await person();
    const moderator = await person({ role: 'moderator' });
    const postId = await publish(author.userId);

    await expect(db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: author.userId, category: 'scam', description: null }))).rejects.toMatchObject({ messageKey: 'board.error.report_own' });
    const first = await db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: reporter.userId, category: 'scam', description: 'Pide depósito sin mostrar la casa' }));
    const again = await db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: reporter.userId, category: 'scam', description: null }));
    expect(again).toEqual({ ticketCode: first.ticketCode, duplicate: true });
    const other = await db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: second.userId, category: 'fake_listing', description: null }));
    expect(other.ticketCode).toBe(first.ticketCode);

    await expect(boardQueue(db(), reporter)).rejects.toMatchObject({ code: 'forbidden' });
    const queue = await boardQueue(db(), moderator);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ code: first.ticketCode, reports: 2, post: { id: postId, district: 'hogar' } });
    expect(JSON.stringify(queue)).not.toContain(reporter.userId);

    await expect(db().transaction((tx) => resolveBoardTicket(tx, { actor: reporter, ticketId: queue[0]!.ticketId, decision: 'remove', note: null }))).rejects.toMatchObject({ code: 'forbidden' });
    await db().transaction((tx) => resolveBoardTicket(tx, { actor: moderator, ticketId: queue[0]!.ticketId, decision: 'remove', note: 'Estafa' }));

    expect((await listBoardPosts(db(), { district: 'hogar', locale: 'es' })).items).toHaveLength(0);
    expect(await getBoardPost(db(), { postId, viewerId: author.userId, locale: 'es' })).toMatchObject({ status: 'removed' });
    expect(await boardQueue(db(), moderator)).toHaveLength(0);
    await expect(db().transaction((tx) => resolveBoardTicket(tx, { actor: moderator, ticketId: queue[0]!.ticketId, decision: 'dismiss', note: null }))).rejects.toMatchObject({ messageKey: 'moderation.error.closed' });
  });

  it('leaves the post in place when a report is dismissed', async () => {
    const author = await person();
    const reporter = await person();
    const moderator = await person({ role: 'moderator' });
    const postId = await publish(author.userId);
    await db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: reporter.userId, category: 'spam', description: null }));
    const [item] = await boardQueue(db(), moderator);
    await db().transaction((tx) => resolveBoardTicket(tx, { actor: moderator, ticketId: item!.ticketId, decision: 'dismiss', note: null }));
    expect((await listBoardPosts(db(), { district: 'hogar', locale: 'es' })).items).toHaveLength(1);
  });
});

describe('Cerca de mí (nearby posts across the board districts)', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });

  it('finds open posts of every district near a point, nearest first, and leaves out the far ones', async () => {
    const author = await person();
    const here = await placePoint(db(), placeCode);
    const there = await placePoint(db(), elsewhere.code);
    expect(here).not.toBeNull();
    expect(there).not.toBeNull();
    await publish(author.userId, { district: 'barrio', subdistrict: 'fairs', title: 'Feria del maíz el domingo' });
    await publish(author.userId, { district: 'diaspora', subdistrict: 'errands', kind: 'request', priceText: '', title: 'Busco quien haga mandados a mi mamá' });
    await publish(author.userId, { district: 'hogar', locationId: elsewhere.id, title: 'Cuarto amueblado en otro país' });

    const near = await nearbyBoardPosts(db(), { ...here!, radiusKm: 15, locale: 'es', limit: 40 });
    expect(near.map((post) => post.district).sort()).toEqual(['barrio', 'diaspora']);
    expect(near.every((post) => post.distanceKm < 1)).toBe(true);

    const wide = await nearbyBoardPosts(db(), { ...here!, radiusKm: 100000, locale: 'es', limit: 40 });
    expect(wide).toHaveLength(3);
    expect(wide[wide.length - 1]!.title).toBe('Cuarto amueblado en otro país');
  });
});
