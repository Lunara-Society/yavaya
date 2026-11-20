import 'dotenv/config';
import { eq, like, or, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { featureFlags, locations, mercaditoListings, rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';

/**
 * Two people for Mirador's browser test (tests/e2e/mirador.cjs), in a LOCAL
 * database only: the owner (an administrator, who sees Mirador while it is
 * closed) with a Mercadito listing to link a video to, and a member who
 * only sees it once the owner opens it. Mirador starts closed.
 *
 *   npx tsx --conditions=react-server tests/e2e/mirador-setup.ts > /tmp/mirador.json
 */
const PASSWORD = 'a-sufficiently-long-passphrase';

async function person(name: string) {
  const email = `e2e-mirador-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: name, locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active', emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return { email, userId };
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('mirador-setup only runs against a local database.');
  // Each run starts from an empty Mirador, so what the feed shows first is this run's video.
  await db().execute(sql`truncate table mirador_videos cascade`);
  const owner = await person('Doña Carmen');
  await db().transaction((tx) => grantRole(tx, { userId: owner.userId, roleKey: 'admin', grantedBy: null }));
  const member = await person('Rosario Prueba');
  const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
  const listing = crypto.randomUUID();
  await db().insert(mercaditoListings).values({ id: listing, sellerUserId: owner.userId, title: 'Moto Honda Navi 2021', description: 'Moto en muy buen estado, papeles al día.', priceMinor: 6_500_000, currencyCode: 'NIO', category: 'vehicles', condition: 'used', locationId: place!.id });
  await db().delete(featureFlags).where(eq(featureFlags.key, 'mirador.open'));
  await db().delete(rateLimitCounters).where(or(like(rateLimitCounters.key, 'login:%'), like(rateLimitCounters.key, 'mirador%')));
  console.log(JSON.stringify({ password: PASSWORD, owner, member, listing }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
