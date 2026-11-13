import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { creditGems } from '@/server/domains/play/progress';

/**
 * An administrator with 3000 gems for the browser check of the Vault
 * (tests/e2e/vault.cjs), in a LOCAL database only. The gems are credited
 * under a test payment reference, never through Stripe. Prints it as JSON.
 */
const PASSWORD = 'a-sufficiently-long-passphrase';

async function main() {
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('vault-setup only runs against a local database.');
  const email = `e2e-vault-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: 'Coleccionista Prueba', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  await db().transaction((tx) => creditGems(tx, userId, 3000, `e2e_${crypto.randomUUID()}`));
  await db().delete(rateLimitCounters).where(like(rateLimitCounters.key, 'login:%'));
  console.log(JSON.stringify({ email, password: PASSWORD, userId }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
