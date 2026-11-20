import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, ne, notLike } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { boardPosts, locations, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { boardInputSchema, createBoardPost, utilityReports } from '@/server/domains/boards/service';
import { BOARD_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/**
 * Barrio's board of cuts (docs/DISTRICT-FOCUS.md): the water, power and
 * internet cuts neighbours reported in the last hours, near the visitor when
 * anything was reported there, and nothing else.
 */

const context = { networkHash: null, addressHash: 'cuts-test', deviceFingerprint: null, userAgent: 'vitest' };
let here = { id: '', code: '' };
let elsewhere = { id: '', code: '' };

async function neighbour() {
  const { userId } = await register(
    db(),
    { email: `cuts-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecino', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const report = (authorUserId: string, locationId: string, subdistrict = 'utilities', title = 'Corte de luz en toda la colonia') =>
  db().transaction((tx) =>
    createBoardPost(tx, { authorUserId, input: boardInputSchema.parse({ district: 'barrio', subdistrict, kind: 'offer', title, body: 'Desde las seis de la mañana no hay luz en las tres cuadras de abajo.', priceText: '', locationId }) }),
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

describe("Barrio's board of cuts", () => {
  it('shows recent cut reports only, newest first, never other kinds of notice', async () => {
    const author = await neighbour();
    await report(author, here.id, 'events', 'Feria del barrio el domingo');
    await report(author, here.id, 'utilities', 'Corte de agua de ocho a doce');
    await report(author, here.id, 'utilities', 'Se fue la luz en la colonia');
    const { items } = await utilityReports(db(), { locale: 'es' });
    expect(items.map((post) => post.title)).toEqual(['Se fue la luz en la colonia', 'Corte de agua de ocho a doce']);
  });

  it('forgets reports older than its window, and closed ones', async () => {
    const author = await neighbour();
    const old = await report(author, here.id);
    const closed = await report(author, here.id, 'utilities', 'Corte de internet resuelto');
    await db().update(boardPosts).set({ createdAt: new Date(Date.now() - (BOARD_RULES.cutsWindowHours + 1) * 60 * 60 * 1000) }).where(eq(boardPosts.id, String(old)));
    await db().update(boardPosts).set({ status: 'closed' }).where(eq(boardPosts.id, String(closed)));
    expect((await utilityReports(db(), { locale: 'es' })).items).toHaveLength(0);
  });

  it('is near the visitor when something was reported there, and everywhere otherwise', async () => {
    await report(await neighbour(), here.id);
    expect(await utilityReports(db(), { locale: 'es', placeCode: here.code })).toMatchObject({ near: true, items: [{ title: 'Corte de luz en toda la colonia' }] });
    expect(await utilityReports(db(), { locale: 'es', placeCode: elsewhere.code })).toMatchObject({ near: false, items: [{ title: 'Corte de luz en toda la colonia' }] });
  });

  it('holds at most its limit', async () => {
    const author = await neighbour();
    for (let i = 0; i < BOARD_RULES.cutsLimit + 2; i++) await report(author, here.id, 'utilities', `Corte de agua número ${i + 1}`);
    expect((await utilityReports(db(), { locale: 'es' })).items).toHaveLength(BOARD_RULES.cutsLimit);
  });
});
