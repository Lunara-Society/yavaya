import 'dotenv/config';
import { eq, like, or } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';

/**
 * One member for the candle's browser test (tests/e2e/sanctuary-candle.cjs), in a LOCAL database only.
 *
 *   npx tsx --conditions=react-server tests/e2e/candle-setup.ts > /tmp/candle.json
 */
const PASSWORD = 'a-sufficiently-long-passphrase';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('candle-setup only runs against a local database.');
  const email = `e2e-candle-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: 'Rosa Prueba', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active', emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  await db().delete(rateLimitCounters).where(or(like(rateLimitCounters.key, 'login:%'), like(rateLimitCounters.key, 'sanctuary%')));
  console.log(JSON.stringify({ password: PASSWORD, member: { email, userId } }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
