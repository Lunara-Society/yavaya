import 'dotenv/config';
import { eq, like, or } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';

/**
 * A member for the browser test of Roxi's panel (tests/e2e/roxi-panel.cjs),
 * in a LOCAL database only. Prints the sign-in as JSON.
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-setup.ts > /tmp/roxi.json
 *
 * Also clears the local sign-in and Roxi counters, since every run signs in
 * and opens several conversations from this one address.
 */

const PASSWORD = 'a-sufficiently-long-passphrase';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('roxi-setup only runs against a local database.');
  const email = `e2e-roxi-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: 'Rosario Prueba', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  await db()
    .delete(rateLimitCounters)
    .where(or(like(rateLimitCounters.key, 'login:%'), like(rateLimitCounters.key, '%roxi%')));
  console.log(JSON.stringify({ email, password: PASSWORD, userId }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
