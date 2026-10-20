import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { userRoles } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole, revokeRole } from '@/server/domains/access/authorize';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'roles-test', deviceFingerprint: null, userAgent: 'vitest' };

beforeEach(resetTransactionalData);
afterAll(closeDb);

async function rows(userId: string, roleKey: string) {
  return db().select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleKey, roleKey)));
}

describe('Role grants', () => {
  it('keep one row per person and role, however often a global role is granted', async () => {
    const { userId } = await register(db(), { email: `r-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Rosa', locale: 'es', acceptedTerms: true }, context);
    // What the admin bootstrap did on every deploy.
    for (let i = 0; i < 3; i += 1) await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
    const [first, ...rest] = await rows(userId, 'admin');
    expect(rest).toHaveLength(0);
    expect(first?.revokedAt).toBeNull();

    // Granting again does not move "since when".
    await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
    expect((await rows(userId, 'admin'))[0]?.grantedAt.getTime()).toBe(first!.grantedAt.getTime());

    // Removed, then appointed again: the same row comes back, from now.
    await db().transaction((tx) => revokeRole(tx, { userId, roleKey: 'admin' }));
    expect((await rows(userId, 'admin'))[0]?.revokedAt).not.toBeNull();
    await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
    const back = await rows(userId, 'admin');
    expect(back).toHaveLength(1);
    expect(back[0]?.revokedAt).toBeNull();
    expect(back[0]!.grantedAt.getTime()).toBeGreaterThanOrEqual(first!.grantedAt.getTime());

    // The member role from registration is one row too.
    expect(await rows(userId, 'member')).toHaveLength(1);
  });
});
