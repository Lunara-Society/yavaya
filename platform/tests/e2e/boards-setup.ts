import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { rateLimitCounters, userProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';

/**
 * Three members for the browser test of the board districts
 * (tests/e2e/boards.cjs), in a LOCAL database only: an author with a WhatsApp
 * number on their profile, a reader, and a moderator. Prints them as JSON.
 *
 *   npx tsx --conditions=react-server tests/e2e/boards-setup.ts > /tmp/boards.json
 */

const PASSWORD = 'a-sufficiently-long-passphrase';

async function member(name: string) {
  const email = `e2e-board-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: name, locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return { email, password: PASSWORD, userId };
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('boards-setup only runs against a local database.');
  const author = await member('Marta Autora');
  const reader = await member('Luis Lector');
  const moderator = await member('Ana Moderadora');
  await db().insert(userProfiles).values({ userId: author.userId, whatsappE164: '+50588881234' }).onConflictDoUpdate({ target: userProfiles.userId, set: { whatsappE164: '+50588881234' } });
  await db().transaction((tx) => grantRole(tx, { userId: moderator.userId, roleKey: 'moderator', grantedBy: null }));
  await db().delete(rateLimitCounters).where(like(rateLimitCounters.key, 'login:%'));
  console.log(JSON.stringify({ author, reader, moderator }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
