import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, ne, notLike } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { boardPosts, demoContent, locations, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { boardInputSchema, createBoardPost } from '@/server/domains/boards/service';
import { publishActivity } from '@/server/domains/notifications/activity';
import { districtPulse } from '@/server/domains/discovery/pulse';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/**
 * The home page's cards say what is really happening in each district
 * (docs/DISTRICT-FOCUS.md): only real things count, demo content never, and
 * "be the first" appears only where a district has nothing a visitor could see.
 */

const context = { networkHash: null, addressHash: 'pulse-test', deviceFingerprint: null, userAgent: 'vitest' };
let here = { id: '', code: '' };
let elsewhere = { id: '', code: '' };

async function person() {
  const { userId } = await register(
    db(),
    { email: `pulse-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const post = (authorUserId: string, locationId: string) =>
  db().transaction((tx) =>
    createBoardPost(tx, {
      authorUserId,
      input: boardInputSchema.parse({ district: 'barrio', subdistrict: 'utilities', kind: 'offer', title: 'Corte de agua mañana temprano', body: 'Cortan el agua de ocho a doce en toda la colonia, avisen a los vecinos.', priceText: '', locationId }),
    }),
  );

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  here = place!;
  const country = here.code.split('.').slice(0, 2).join('.');
  const [other] = await db()
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(and(eq(locations.level, 'city'), ne(locations.id, here.id), notLike(locations.code, `${country}.%`)))
    .orderBy(locations.code)
    .limit(1);
  elsewhere = other!;
});

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('The home cards’ pulse', () => {
  it('says "be the first" only for a district with nothing in it, and never for a members-only one', async () => {
    const pulse = await districtPulse(db());
    expect(pulse.barrio).toEqual({ today: 0, week: 0, near: false, empty: true });
    expect(pulse.mercadito?.empty).toBe(true);
    expect(pulse.services?.empty).toBeNull();
    expect(pulse.community?.empty).toBeNull();
  });

  it('counts a real board post as new today, and the district is no longer empty', async () => {
    await post(await person(), here.id);
    const pulse = await districtPulse(db());
    expect(pulse.barrio).toMatchObject({ today: 1, week: 1, empty: false });
  });

  it('says "near you" only where it happened, and otherwise counts everywhere', async () => {
    await post(await person(), here.id);
    expect((await districtPulse(db(), { locationCode: here.code })).barrio).toMatchObject({ today: 1, near: true });
    expect((await districtPulse(db(), { locationCode: elsewhere.code })).barrio).toMatchObject({ today: 1, near: false });
  });

  it('never counts a registered demo account', async () => {
    const demo = await person();
    await db().insert(demoContent).values({ subjectType: 'user', subjectId: demo, district: 'barrio', expiresAt: new Date(Date.now() + 86_400_000) });
    await post(demo, here.id);
    expect((await districtPulse(db())).barrio).toEqual({ today: 0, week: 0, near: false, empty: true });
  });

  it('counts live activity per district, refusing demo events, and keeps older ones as "this week"', async () => {
    await db().transaction((tx) => publishActivity(tx, { kind: 'animal_listed', district: 'animals', locationId: here.id }));
    await db().transaction((tx) => publishActivity(tx, { kind: 'animal_listed', district: 'animals', locationId: here.id, isDemoSubject: true }));
    const later = new Date(Date.now() + (LIVE_FEED_RULES.windowHours + 1) * 60 * 60 * 1000);
    expect((await districtPulse(db())).animals).toMatchObject({ today: 1, week: 1 });
    expect((await districtPulse(db(), { now: later })).animals).toMatchObject({ today: 0, week: 1 });
  });

  it('forgets a closed post', async () => {
    const id = await post(await person(), here.id);
    await db().update(boardPosts).set({ status: 'closed' }).where(eq(boardPosts.id, String(id)));
    expect((await districtPulse(db())).barrio).toMatchObject({ today: 0, empty: true });
  });
});
