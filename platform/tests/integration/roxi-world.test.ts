import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { communityPosts, demoContent, locations, mercaditoListings, userProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { listNotifications } from '@/server/domains/notifications/service';
import { setPlan } from '@/server/domains/roxi/credits';
import { addItem, cleanBody, deliverDueReminders, listItems, memoryForRoxi, updateItem } from '@/server/domains/roxi/items';
import { businessSummary, parseAmount, periodOf, recordEntry, toMinor, voidEntry } from '@/server/domains/roxi/business';
import { communityPulse, lifePath, memberClock, opportunityFor, runWatches } from '@/server/domains/roxi/world';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'roxi-world-test', deviceFingerprint: null, userAgent: 'vitest' };
let managuaId: string;

async function member() {
  const { userId } = await register(
    db(),
    { email: `rw-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function listing(sellerUserId: string, title: string, priceMinor: number, currencyCode = 'NIO', publishedAt = new Date()) {
  const id = crypto.randomUUID();
  await db().insert(mercaditoListings).values({ id, sellerUserId, title, description: title, priceMinor, currencyCode, category: 'home', condition: 'used', locationId: managuaId, publishedAt });
  return id;
}

async function pro(userId: string) {
  await setPlan(db(), { userId, plan: 'pro', source: 'admin', providerSubscriptionId: null, periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 20 * 86_400_000) });
}

beforeEach(async () => {
  await resetTransactionalData();
  const [managua] = await db().select().from(locations).where(eq(locations.code, 'ca.ni.mn.managua')).limit(1);
  managuaId = managua!.id;
});
afterAll(async () => {
  await closeDb();
});

describe('the business ledger', () => {
  it('reads amounts the way people write them', () => {
    expect(parseAmount('1,800')).toBe(1800);
    expect(parseAmount('1.800')).toBe(1800);
    expect(parseAmount('1800.50')).toBe(1800.5);
    expect(parseAmount('1.800,50')).toBe(1800.5);
    expect(parseAmount('25')).toBe(25);
    expect(parseAmount('C$ 600')).toBe(600);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(() => toMinor('-5')).toThrow();
    expect(() => toMinor('')).toThrow();
  });

  it('keeps sales, estimated profit and the cash difference apart, per currency, and lets an entry be voided', async () => {
    const userId = await member();
    const day = '2026-11-06';
    await recordEntry(db(), userId, { kind: 'sale', amount: 1800, cost: 1200, currency: 'NIO', day });
    await recordEntry(db(), userId, { kind: 'sale', amount: '75', currency: 'nio', day, note: '3 gaseosas' });
    await recordEntry(db(), userId, { kind: 'stock', amount: 600, currency: 'NIO', day });
    await recordEntry(db(), userId, { kind: 'expense', amount: 100, currency: 'NIO', day });
    await recordEntry(db(), userId, { kind: 'owed_to_me', amount: 300, currency: 'NIO', day });
    await recordEntry(db(), userId, { kind: 'paid_to_me', amount: 100, currency: 'NIO', day });
    await recordEntry(db(), userId, { kind: 'sale', amount: 20, currency: 'USD', day });
    const wrong = await recordEntry(db(), userId, { kind: 'expense', amount: 9999, currency: 'NIO', day });
    await voidEntry(db(), userId, wrong.id);
    const [nio, usd] = [...(await businessSummary(db(), userId, { from: day, to: day }))].sort((a, b) => a.currency.localeCompare(b.currency));
    expect(nio).toMatchObject({ currency: 'NIO', sales: 1875, salesCount: 2, costedSales: 1800, costOfCostedSales: 1200, grossProfitOnCosted: 600, stockBought: 600, expenses: 100, cashDifference: 1175, owedToMe: 200, iOwe: 0 });
    expect(usd).toMatchObject({ currency: 'USD', sales: 20, cashDifference: 20 });
    expect(await businessSummary(db(), (await member()), { from: day, to: day })).toEqual([]);
  });

  it('works out the week and month a day belongs to', () => {
    expect(periodOf('2026-11-06', 'week')).toEqual({ from: '2026-11-02', to: '2026-11-06' });
    expect(periodOf('2026-11-06', 'month')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
  });
});

describe('missions, capsules and promises', () => {
  it('keeps missions and capsules for Pro, ticks steps, and does not show a capsule before it opens', async () => {
    const userId = await member();
    await expect(addItem(db(), userId, { kind: 'mission', body: cleanBody({ title: 'Cumpleaños', steps: ['Fecha', 'Pastel'] }) })).rejects.toMatchObject({ messageKey: 'roxi.memory.error.needs_pro' });
    await pro(userId);
    const mission = await addItem(db(), userId, { kind: 'mission', body: cleanBody({ title: 'Cumpleaños', target: 5000, steps: ['Fecha', 'Pastel'] }) });
    await updateItem(db(), userId, mission.id, { step: { index: 0, done: true } });
    expect((await listItems(db(), userId, 'mission'))[0]?.steps).toEqual([{ text: 'Fecha', done: true }, { text: 'Pastel', done: false }]);
    await updateItem(db(), userId, mission.id, { step: { index: 1, done: true } });
    expect((await listItems(db(), userId, 'mission'))[0]?.done).toBe(true);

    const opens = new Date(Date.now() + 3 * 86_400_000);
    const capsule = await addItem(db(), userId, { kind: 'capsule', body: cleanBody({ title: 'Para mí en un año', detail: 'Ánimo' }), dueAt: opens });
    const [sealed] = await listItems(db(), userId, 'capsule');
    expect(sealed?.title).toBe('');
    expect(sealed?.sealedUntil?.getTime()).toBe(opens.getTime());
    expect(JSON.stringify(await memoryForRoxi(db(), userId, '2026-11-06'))).not.toContain('Ánimo');
    await expect(updateItem(db(), userId, capsule.id, { body: { title: 'otro' } })).rejects.toMatchObject({ messageKey: 'roxi.memory.error.capsule_sealed' });
    await expect(addItem(db(), userId, { kind: 'capsule', body: cleanBody({ title: 'mañana mismo' }), dueAt: new Date(Date.now() + 3_600_000) })).rejects.toMatchObject({ messageKey: 'roxi.memory.error.capsule_when' });
  });

  it('opens a capsule on its day with a notice that does not carry its words, and snoozes a promise', async () => {
    const userId = await member();
    await pro(userId);
    const capsule = await addItem(db(), userId, { kind: 'capsule', body: cleanBody({ title: 'Secreto' }), dueAt: new Date(Date.now() + 2 * 86_400_000) });
    expect((await deliverDueReminders(db(), new Date(Date.now() + 3 * 86_400_000))).sent).toBe(1);
    const notes = await listNotifications(db(), userId);
    expect(notes[0]?.titleKey).toBe('roxi.notify.capsule');
    expect(JSON.stringify(notes)).not.toContain('Secreto');
    expect((await listItems(db(), userId, 'capsule')).find((item) => item.id === capsule.id)?.title).toBe('Secreto');

    const promise = await addItem(db(), userId, { kind: 'reminder', body: cleanBody({ title: 'Publicar mi CV', action: 'preparar el perfil de Trabajo' }), dueAt: new Date(Date.now() + 3_600_000) });
    const snoozed = await updateItem(db(), userId, promise.id, { snoozeHours: 24 });
    expect(snoozed.dueAt!.getTime()).toBeGreaterThan(Date.now() + 24 * 3_600_000);
  });
});

describe('the world around the member', () => {
  it('counts only public, real activity: no family support, no prayer, no demo', async () => {
    const seller = await member();
    await listing(seller, 'Mesa de madera', 150_000);
    const demo = await listing(seller, 'Demo', 100);
    await db().insert(demoContent).values({ subjectType: 'mercadito_listing', subjectId: demo, district: 'mercadito' , expiresAt: new Date(Date.now() + 86_400_000) });
    await db().insert(communityPosts).values([
      { authorUserId: seller, kind: 'help_request', title: 'Ayuda para mover una cama', body: '…', locationId: managuaId },
      { authorUserId: seller, kind: 'family_support', title: 'Algo privado', body: '…', locationId: managuaId },
      { authorUserId: seller, kind: 'prayer', title: 'Oración', body: '…', locationId: managuaId },
    ]);
    const pulse = await communityPulse(db(), { placeCode: 'ca.ni.mn.managua', placeName: 'Managua' });
    expect(pulse.mercadito.newListings).toBe(1);
    expect(pulse.mercadito.newest?.title).toBe('Mesa de madera');
    expect(pulse.community.openHelpRequests).toBe(1);
    expect(JSON.stringify(pulse)).not.toContain('Algo privado');
    expect(pulse.empty).toBe(false);
    const quiet = await communityPulse(db(), { placeCode: 'ca.ni.gr.nandaime', placeName: 'Nandaime' });
    expect(quiet.empty).toBe(true);
  });

  it('watches: one notice per new match under the price, in the same currency, never for what was already there', async () => {
    const buyer = await member();
    const seller = await member();
    await listing(seller, 'Refrigeradora vieja', 400_000, 'NIO', new Date(Date.now() - 3_600_000));
    await addItem(db(), buyer, { kind: 'watch', body: cleanBody({ title: 'refrigeradora', district: 'mercadito', query: 'refrigeradora', maxPrice: 5000, currency: 'NIO' }) });
    await listing(seller, 'Refrigeradora LG', 450_000, 'NIO');
    await listing(seller, 'Refrigeradora grande', 650_000, 'NIO');
    await listing(seller, 'Refrigeradora en dólares', 4_000, 'USD');
    const first = await runWatches(db());
    expect(first.sent).toBe(1);
    expect((await runWatches(db())).sent).toBe(0);
    const notes = await listNotifications(db(), buyer);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.params).toMatchObject({ title: 'Refrigeradora LG' });
  });

  it('finds a daily opportunity only when something real fits, and builds the path from records and saved milestones', async () => {
    const userId = await member();
    await db().update(userProfiles).set({ locationId: managuaId }).where(eq(userProfiles.userId, userId));
    expect(await opportunityFor(db(), userId)).toBeNull();
    await addItem(db(), userId, { kind: 'goal', body: cleanBody({ title: 'Comprar una motocicleta' }) });
    const seller = await member();
    await listing(seller, 'Motocicleta Honda 2019', 3_000_000);
    expect(await opportunityFor(db(), userId)).toMatchObject({ kind: 'goal', title: 'Motocicleta Honda 2019' });

    await addItem(db(), userId, { kind: 'milestone', body: cleanBody({ title: 'Conseguí trabajo', source: 'member' }), day: '2026-04-10' });
    const path = await lifePath(db(), userId);
    expect(path.find((entry) => entry.key === 'joined')?.source).toBe('yavaya');
    expect(path.find((entry) => entry.text === 'Conseguí trabajo')?.source).toBe('member');
  });
});

describe("the member's clock", () => {
  it("counts today in the member's own country and starts the ledger in its currency, guessing neither without a place", async () => {
    const userId = await member();
    // 03:00 UTC on 7 November is still the evening of 6 November in Central America.
    const at = new Date('2026-11-07T03:00:00Z');
    expect(await memberClock(db(), userId, at)).toMatchObject({ today: '2026-11-06', currency: null });
    const [honduras] = await db().select({ id: locations.id }).from(locations).where(eq(locations.code, 'ca.hn')).limit(1);
    await db().update(userProfiles).set({ locationId: honduras!.id }).where(eq(userProfiles.userId, userId));
    expect(await memberClock(db(), userId, at)).toEqual({ timeZone: 'America/Tegucigalpa', today: '2026-11-06', currency: 'HNL' });
  });
});
