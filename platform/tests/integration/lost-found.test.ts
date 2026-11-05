import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { animalsLostFound, locations, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { listNotifications } from '@/server/domains/notifications/service';
import {
  closeLostFound,
  deleteLostFound,
  expireLostFound,
  getLostFound,
  listLostFound,
  lostFoundInputSchema,
  lostFoundReports,
  publishLostFound,
  reportLostFound,
  resolveLostFoundTicket,
  updateLostFound,
} from '@/server/domains/animals/lost-found';
import type { StoredImage } from '@/server/domains/media/service';
import { ANIMALS_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'lost-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;
let otherPlaceId: string;

async function member() {
  const { userId } = await register(
    db(),
    { email: `lf-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const photo = (): StoredImage[] =>
  [{ id: crypto.randomUUID(), storageKey: `lost/${crypto.randomUUID()}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 1000, sourceSha256: crypto.randomUUID().replace(/-/g, '') }] as StoredImage[];

const post = (overrides: Record<string, unknown> = {}) =>
  lostFoundInputSchema.parse({
    kind: 'lost',
    species: 'dog',
    name: 'Firulais',
    description: 'Perro café con collar rojo, se asustó con los cohetes y salió corriendo.',
    locationId: placeId,
    seenOn: new Date().toISOString().slice(0, 10),
    whatsapp: '+505 8888 7777',
    ...overrides,
  });

beforeAll(async () => {
  const places = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(2);
  placeId = places[0]!.id;
  otherPlaceId = places[1]!.id;
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('lost and found', () => {
  it('tells the owner when the same kind of animal is found in the same place', async () => {
    const owner = await member();
    const finder = await member();
    const elsewhere = await member();
    const lostId = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    await db().transaction((tx) => publishLostFound(tx, { authorUserId: elsewhere, input: post({ kind: 'found', locationId: otherPlaceId }), images: photo() }));
    await db().transaction((tx) => publishLostFound(tx, { authorUserId: finder, input: post({ kind: 'found', species: 'cat' }), images: photo() }));
    expect(await listNotifications(db(), owner)).toHaveLength(0);

    const foundId = await db().transaction((tx) => publishLostFound(tx, { authorUserId: finder, input: post({ kind: 'found', name: 'Ignorado' }), images: photo() }));
    expect((await listNotifications(db(), owner)).map((n) => n.titleKey)).toEqual(['notify.animals.possible_match']);
    const detail = await getLostFound(db(), { postId: lostId, viewerId: owner, viewerIsReviewer: false, locale: 'es' });
    expect(detail?.matches.map((m) => m.id)).toEqual([foundId]);
    // A finder does not get to name someone else's animal.
    expect((await getLostFound(db(), { postId: foundId, viewerId: null, viewerIsReviewer: false, locale: 'es' }))?.post.name).toBeNull();

    await db().transaction((tx) => closeLostFound(tx, { authorUserId: owner, postId: lostId, outcome: 'reunited' }));
    expect((await listLostFound(db(), { locale: 'es', kind: 'lost' })).items).toHaveLength(0);
  });

  it('shows the contact number only to signed-in members', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    expect((await getLostFound(db(), { postId: id, viewerId: null, viewerIsReviewer: false, locale: 'es' }))?.whatsappE164).toBeNull();
    const reader = await member();
    expect((await getLostFound(db(), { postId: id, viewerId: reader, viewerIsReviewer: false, locale: 'es' }))?.whatsappE164).toBe('+50588887777');
  });

  it('closes old posts and tells their authors', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    await db().update(animalsLostFound).set({ createdAt: new Date(Date.now() - (ANIMALS_RULES.lostOpenDays + 1) * 86_400_000) }).where(eq(animalsLostFound.id, id));
    expect(await expireLostFound(db())).toEqual({ closed: 1 });
    expect((await listNotifications(db(), owner)).map((n) => n.titleKey)).toContain('notify.animals.lost_expired');
  });

  it('refuses a date in the future and lets a reviewer remove a ransom post', async () => {
    const owner = await member();
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await expect(db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post({ seenOn: future }), images: photo() }))).rejects.toMatchObject({ messageKey: 'animals.lost.error.date' });

    const scammer = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: scammer, input: post({ kind: 'found' }), images: photo() }));
    await db().transaction((tx) => reportLostFound(tx, { reporterUserId: owner, postId: id, category: 'scam', description: 'Me pidió dinero para devolverlo.' }));
    const rev = await member();
    await db().transaction((tx) => grantRole(tx, { userId: rev, roleKey: 'district_reviewer', grantedBy: null }));
    const [ticket] = await lostFoundReports(db());
    expect(ticket?.priority).toBe('high');
    await db().transaction((tx) => resolveLostFoundTicket(tx, { actor: { userId: rev, status: 'active' }, ticketId: ticket!.ticketId, decision: 'remove_post', note: 'Pedía rescate.' }));
    expect(await getLostFound(db(), { postId: id, viewerId: owner, viewerIsReviewer: false, locale: 'es' })).toBeNull();
  });

  it('lets the author correct a wrong species and the place, and nobody else', async () => {
    const owner = await member();
    const stranger = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    await expect(db().transaction((tx) => updateLostFound(tx, { authorUserId: stranger, postId: id, input: post({ species: 'cat' }) }))).rejects.toMatchObject({ code: 'not_found' });
    await db().transaction((tx) => updateLostFound(tx, { authorUserId: owner, postId: id, input: post({ species: 'cat', locationId: otherPlaceId }) }));
    const [row] = await db().select().from(animalsLostFound).where(eq(animalsLostFound.id, id));
    expect(row?.species).toBe('cat');
    expect(row?.locationId).toBe(otherPlaceId);
  });

  it('lets the author delete a post, which then opens for nobody', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    await db().transaction((tx) => deleteLostFound(tx, { authorUserId: owner, postId: id }));
    expect(await getLostFound(db(), { postId: id, viewerId: null, viewerIsReviewer: false, locale: 'es' })).toBeNull();
    expect(await getLostFound(db(), { postId: id, viewerId: owner, viewerIsReviewer: false, locale: 'es' })).toBeNull();
    expect((await listLostFound(db(), { locale: 'es', page: 1 })).items.map((item) => item.id)).not.toContain(id);
  });

  it('keeps a closed post from the public, but not from its author', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: owner, input: post(), images: photo() }));
    await db().transaction((tx) => closeLostFound(tx, { authorUserId: owner, postId: id, outcome: 'reunited' }));
    expect(await getLostFound(db(), { postId: id, viewerId: null, viewerIsReviewer: false, locale: 'es' })).toBeNull();
    expect((await getLostFound(db(), { postId: id, viewerId: owner, viewerIsReviewer: false, locale: 'es' }))?.isAuthor).toBe(true);
  });
});
