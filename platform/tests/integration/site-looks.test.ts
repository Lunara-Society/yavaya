import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { allLooks, lookEnabled, setLook } from '@/server/domains/platform/looks';
import { SITE_LOOK_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';
import { errorHasCode } from '../helpers/errors';

const context = { networkHash: null, addressHash: 'looks-test', deviceFingerprint: null, userAgent: 'vitest' };

beforeEach(async () => {
  await resetTransactionalData();
  clearSettingsCache();
});
afterAll(closeDb);

async function person(admin: boolean) {
  const { userId } = await register(
    db(),
    { email: `look-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: admin ? 'Dueña' : 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  if (admin) await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  return { userId, status: 'active' as const };
}

describe("The site's looks (Admin → Diseño del sitio)", () => {
  it("are the owner's choice until someone touches a switch", async () => {
    expect(await allLooks(db())).toEqual({ home: SITE_LOOK_RULES.home, worlds: SITE_LOOK_RULES.worlds, guardian: SITE_LOOK_RULES.guardian, logo: SITE_LOOK_RULES.logo });
  });

  it('can be turned back by an administrator, at once and on the record', async () => {
    const owner = await person(true);
    await db().transaction((tx) => setLook(tx, { actor: owner, key: 'home', enabled: false }));
    expect(await lookEnabled(db(), 'home')).toBe(false);
    expect(await lookEnabled(db(), 'worlds')).toBe(SITE_LOOK_RULES.worlds);

    const [audit] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'platform.flag_changed'), eq(auditEvents.subjectId, 'look.first_light_home')));
    expect(audit?.actorUserId).toBe(owner.userId);
    expect(audit?.metadata).toMatchObject({ enabled: false });

    await db().transaction((tx) => setLook(tx, { actor: owner, key: 'home', enabled: true }));
    expect(await lookEnabled(db(), 'home')).toBe(true);
  });

  it('cannot be changed by anyone else, whatever the form sends', async () => {
    const neighbour = await person(false);
    let refused: unknown = null;
    await db()
      .transaction((tx) => setLook(tx, { actor: neighbour, key: 'worlds', enabled: false }))
      .catch((error: unknown) => {
        refused = error;
      });
    expect(errorHasCode(refused, 'forbidden')).toBe(true);
    expect(await lookEnabled(db(), 'worlds')).toBe(SITE_LOOK_RULES.worlds);
    expect(await db().select().from(auditEvents).where(eq(auditEvents.action, 'platform.flag_changed'))).toHaveLength(0);
  });

  it('cannot be changed by a signed-out request or a suspended administrator', async () => {
    const owner = await person(true);
    for (const actor of [null, { ...owner, status: 'suspended' as const }]) {
      await expect(db().transaction((tx) => setLook(tx, { actor, key: 'home', enabled: false }))).rejects.toBeTruthy();
    }
    expect(await lookEnabled(db(), 'home')).toBe(SITE_LOOK_RULES.home);
  });
});
