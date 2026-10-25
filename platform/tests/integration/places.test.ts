import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { activityEvents, locations, users } from '@/server/db/schema';
import { foldText, nearestPlace, placeByCode, placeCountries, searchPlaces, sizeTier } from '@/server/domains/geography/places';
import { register } from '@/server/domains/identity/service';
import { createPost, postInputSchema } from '@/server/domains/community/service';
import { recentActivity } from '@/server/domains/notifications/activity';
import { resetTransactionalData } from '../helpers/database';

beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('place search', () => {
  it('ignores accents and case', () => {
    expect(foldText('Ciudad de Panamá')).toBe('ciudad de panama');
    expect(foldText('  LEÓN ')).toBe('leon');
  });

  it('finds a town from the first letters, bigger places first', async () => {
    const hits = await searchPlaces(db(), 'leon', { settlementsOnly: true });
    expect(hits.some((hit) => foldText(hit.name) === 'leon')).toBe(true);
    // A namesake is told apart by its department and country.
    expect(hits.every((hit) => /,/.test(hit.context))).toBe(true);
    const prefixed = hits.filter((hit) => foldText(hit.name).startsWith('leon'));
    const populations = prefixed.map((hit) => hit.population ?? 0);
    expect(populations).toEqual([...populations].sort((a, b) => b - a));
  });

  it('does not let a hamlet of the exact name bury a city that starts with it', async () => {
    const hits = await searchPlaces(db(), 'san cristobal', { settlementsOnly: true, limit: 50 });
    const city = hits.findIndex((hit) => hit.code === 'na.mx.chp.san-cristobal-de-las-casas');
    expect(city).toBe(0);
  });

  it('includes Mexico, in pesos, now that it is open', async () => {
    const [tulum] = await searchPlaces(db(), 'tulum', { settlementsOnly: true });
    expect(tulum?.countryCode).toBe('na.mx');
    expect(tulum?.currencyCode).toBe('MXN');
  });

  it('ranks a name that starts with the query above one that merely contains it', async () => {
    const hits = await searchPlaces(db(), 'san', { settlementsOnly: true, limit: 50 });
    const firstContains = hits.findIndex((hit) => !foldText(hit.name).split(' ').some((word) => word.startsWith('san')));
    const lastPrefix = hits.map((hit) => foldText(hit.name).startsWith('san')).lastIndexOf(true);
    if (firstContains !== -1) expect(lastPrefix).toBeLessThan(firstContains);
  });

  it('offers only towns and cities to a form, and departments too to a filter', async () => {
    const settlements = await searchPlaces(db(), 'chinandega', { settlementsOnly: true });
    expect(settlements.every((hit) => ['city', 'town', 'village', 'neighborhood'].includes(hit.level))).toBe(true);
    const any = await searchPlaces(db(), 'chinandega');
    expect(any.some((hit) => hit.level === 'state')).toBe(true);
  });

  it('needs at least two letters', async () => {
    expect(await searchPlaces(db(), 'a')).toEqual([]);
  });

  it('only offers launch countries', async () => {
    const countries = await placeCountries(db());
    const [unsupported] = await db().select({ code: locations.code }).from(locations).where(eq(locations.isSupportedMarket, false)).limit(1);
    if (unsupported) expect(countries.map((country) => country.code)).not.toContain(unsupported.code);
    expect(countries.length).toBeGreaterThanOrEqual(7);
  });

  it('turns a position into the nearest town, and refuses one far from any', async () => {
    const [managua] = await db().select().from(locations).where(eq(locations.code, 'ca.ni.mn.managua')).limit(1);
    if (managua?.latitude != null && managua.longitude != null) {
      const near = await nearestPlace(db(), { latitude: managua.latitude + 0.01, longitude: managua.longitude });
      expect(near?.code).toBe('ca.ni.mn.managua');
    }
    expect(await nearestPlace(db(), { latitude: 0, longitude: 0 })).toBeNull();
  });

  it('sizes places by population, and does not guess without one', () => {
    expect(sizeTier('city', 1_000_000)).toBe('city_big');
    expect(sizeTier('city', 100_000)).toBe('city_medium');
    expect(sizeTier('city', 30_000)).toBe('city_small');
    expect(sizeTier('town', 12_000)).toBe('town_big');
    expect(sizeTier('town', 6_000)).toBe('town_medium');
    expect(sizeTier('town', 800)).toBe('town_small');
    expect(sizeTier('town', null)).toBeNull();
  });

  it('resolves a saved code, and ignores one that is not a place', async () => {
    expect((await placeByCode(db(), 'ca.ni.mn.managua'))?.name).toBeTruthy();
    expect(await placeByCode(db(), 'ca.nowhere')).toBeNull();
  });
});

describe('live activity from Community', () => {
  async function member() {
    const { userId } = await register(
      db(),
      {
        email: `places-${crypto.randomUUID()}@example.com`,
        password: 'a-sufficiently-long-passphrase',
        displayName: 'Vecino',
        locale: 'es',
        acceptedTerms: true,
      },
      { networkHash: null, addressHash: 'places-test', deviceFingerprint: null, userAgent: 'vitest' },
    );
    await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
    return userId;
  }

  it('announces a request for help with its town, never a prayer or family support', async () => {
    const [place] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).limit(1);
    const author = await member();
    const post = (kind: string) =>
      postInputSchema.parse({
        kind,
        title: 'Necesito ayuda para mudarme',
        body: 'El sábado por la mañana, dos horas, tengo que bajar muebles de un segundo piso.',
        locationId: place!.id,
        anonymous: kind !== 'help_request',
      });
    await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post('help_request') }));
    await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post('prayer') }));
    await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post('family_support') }));

    const events = await db().select({ kind: activityEvents.kind }).from(activityEvents);
    expect(events.map((event) => event.kind)).toEqual(['community_post_published']);

    const feed = await recentActivity(db(), { locationCode: place!.code });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.params.place).toBeTruthy();
  });
});

describe('the country a place is in', () => {
  it('is read from the tree, for every kind of place', async () => {
    const { countryOf } = await import('@/server/domains/geography/service');
    // Places of every level below country, spread across countries, against the country found by walking up the parents.
    const sample = (await db().execute(sql`
      select l.id, (
        with recursive up as (
          select p.id, p.parent_id, p.level, p.iso_code from locations p where p.id = l.id
          union all
          select p.id, p.parent_id, p.level, p.iso_code from locations p join up on p.id = up.parent_id
        ) select iso_code from up where level = 'country' limit 1
      ) as expected
      from locations l where l.level not in ('region', 'country')
      order by md5(l.code) limit 60`)) as unknown as Array<{ id: string; expected: string | null }>;
    expect(sample.length).toBeGreaterThan(10);
    expect(new Set(sample.map((row) => row.expected)).size).toBeGreaterThan(1);
    for (const row of sample) expect(await countryOf(db(), row.id)).toBe(row.expected);
  });
});
