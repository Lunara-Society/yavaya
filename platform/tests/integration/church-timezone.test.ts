import { afterAll, describe, expect, it } from 'vitest';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { locations } from '@/server/db/schema';
import { placeTimezone } from '@/server/domains/sanctuary/service';

afterAll(closeDb);

describe('a church keeps the time of its own place', () => {
  it('takes the nearest timezone in the place\'s own path, for a city in every country', async () => {
    // The lookup once ignored the place it was asked about and returned whichever zone came first
    // (a Belize City church kept Panama's clock). One city per country catches that.
    const cities = await db()
      .select({ id: locations.id, code: locations.code, path: locations.path })
      .from(locations)
      .where(eq(locations.level, 'city'))
      .orderBy(asc(locations.code));
    const onePerCountry = [...new Map(cities.map((city) => [city.path[1], city])).values()];
    expect(onePerCountry.length).toBeGreaterThan(1);
    for (const city of onePerCountry) {
      const [expected] = await db()
        .select({ tz: locations.timezone })
        .from(locations)
        .where(and(inArray(locations.code, [...city.path, city.code]), isNotNull(locations.timezone)))
        .orderBy(desc(locations.depth))
        .limit(1);
      expect({ city: city.code, tz: await placeTimezone(db(), city.id) }).toEqual({ city: city.code, tz: expected?.tz ?? null });
    }
  });
});
