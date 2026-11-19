import 'dotenv/config';
import { eq, like, or } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';

/**
 * A member for the browser test of Roxi's listing flagship
 * (tests/e2e/roxi-flagship.cjs), in a LOCAL database only. An administrator,
 * so the flagship is on for them while its switch is off (the owner's
 * preview), and so the test can read the funnel on Admin → Visitas.
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-flagship-setup.ts > /tmp/flagship.json
 */
const PASSWORD = 'a-sufficiently-long-passphrase';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('roxi-flagship-setup only runs against a local database.');
  const email = `e2e-flagship-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: 'Rosario Prueba', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active', emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
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
