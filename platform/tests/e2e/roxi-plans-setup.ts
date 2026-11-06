import 'dotenv/config';
import { eq, like, or } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';

/**
 * Two members for the browser check of Roxi's plans pages
 * (tests/e2e/roxi-plans.cjs), in a LOCAL database only: one plain member and
 * one administrator (who can try Max without paying). Prints both as JSON.
 */
const PASSWORD = 'a-sufficiently-long-passphrase';

async function member(admin: boolean) {
  const email = `e2e-plans-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: admin ? 'Admin Prueba' : 'Vecina Prueba', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  if (admin) await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  return { email, password: PASSWORD, userId };
}

async function main() {
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('roxi-plans-setup only runs against a local database.');
  const plain = await member(false);
  const admin = await member(true);
  await db().delete(rateLimitCounters).where(or(like(rateLimitCounters.key, 'login:%'), like(rateLimitCounters.key, '%roxi%')));
  console.log(JSON.stringify({ plain, admin }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
