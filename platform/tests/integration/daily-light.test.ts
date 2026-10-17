import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { notificationPreferences, notifications, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { deliverDailyLight, readDailyKinds, setDailyKinds } from '@/server/domains/sanctuary/daily';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'daily-light-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member() {
  const { userId } = await register(
    db(),
    { email: `d-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecino', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const dailyFor = (userId: string) => db().select().from(notifications).where(eq(notifications.userId, userId));

beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('daily light', () => {
  it('tells each member once per light day, and again the next morning', async () => {
    const userId = await member();
    // No place: the day turns at 14:00 UTC.
    expect((await deliverDailyLight(db(), new Date('2027-02-10T15:00:00Z'))).notified).toBeGreaterThanOrEqual(1);
    await deliverDailyLight(db(), new Date('2027-02-10T15:15:00Z'));
    await deliverDailyLight(db(), new Date('2027-02-11T09:00:00Z')); // still the 10th's light
    let rows = (await dailyFor(userId)).filter((row) => row.category === 'daily');
    expect(rows.map((row) => row.dedupeKey)).toEqual(['daily:2027-02-10']);

    await deliverDailyLight(db(), new Date('2027-02-11T14:05:00Z'));
    rows = (await dailyFor(userId)).filter((row) => row.category === 'daily');
    expect(rows.map((row) => row.dedupeKey).sort()).toEqual(['daily:2027-02-10', 'daily:2027-02-11']);
    expect(rows[0]!.href).toBe('/sanctuary#daily');
  });

  it('respects a member who switched the morning note off', async () => {
    const userId = await member();
    await db().insert(notificationPreferences).values({ userId, category: 'daily', channel: 'in_app', enabled: false });
    await deliverDailyLight(db(), new Date('2027-02-10T15:00:00Z'));
    expect((await dailyFor(userId)).filter((row) => row.category === 'daily')).toHaveLength(0);
  });

  it('keeps the chosen kinds, and reads none chosen as all', async () => {
    const userId = await member();
    expect(await readDailyKinds(db(), userId)).toEqual(['prayer', 'saying', 'quote', 'blessing']);
    await setDailyKinds(db(), userId, ['prayer', 'blessing']);
    expect(await readDailyKinds(db(), userId)).toEqual(['prayer', 'blessing']);
    await setDailyKinds(db(), userId, []);
    expect(await readDailyKinds(db(), userId)).toEqual(['prayer', 'saying', 'quote', 'blessing']);
  });
});
