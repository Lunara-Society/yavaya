import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { safeSpaceMembers, safeSpaceRoomMessages, twoStepFactors, users } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { codeAt, newSecret, stepAt, verifySecondStep } from '@/server/domains/identity/two-step';
import { resealUnderCurrentKeys } from '@/server/security/reseal';
import { seal, unseal } from '@/server/security/sealed-text';
import { resetTransactionalData } from '../helpers/database';

/**
 * Rotating the keys that seal two-step secrets and Espacio Violeta text:
 * with the old key in `…_PREVIOUS`, nobody is locked out, and the release
 * step reseals everything under the new key.
 */

const OLD = 'the-old-key-that-is-long-enough-for-hkdf-000001';
const NEW = 'the-new-key-that-is-long-enough-for-hkdf-000002';
const OTHER = 'a-key-nobody-has-any-more-long-enough-00000003';
const KEYS = ['TWO_STEP_KEY', 'TWO_STEP_KEY_PREVIOUS', 'SAFE_SPACE_KEY', 'SAFE_SPACE_KEY_PREVIOUS'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function keys(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}

const context = { networkHash: null, addressHash: 'rotation-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member() {
  const { userId } = await register(
    db(),
    { email: `rot-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Rotación', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

describe('rotating sealing keys', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetServerEnvCache();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('keeps two-step working mid-rotation, then reseals it under the new key', async () => {
    const userId = await member();
    const secret = newSecret();
    await db().insert(twoStepFactors).values({ userId, secretSealed: seal(OLD, 'two-step.secret', secret), lastUsedStep: 0 });

    keys({ TWO_STEP_KEY: NEW, TWO_STEP_KEY_PREVIOUS: OLD });
    const now = Date.now();
    const before = await db().transaction((tx) => verifySecondStep(tx, { userId, input: codeAt(secret, stepAt(now)), now }));
    expect(before).toMatchObject({ ok: true });

    const reports = await resealUnderCurrentKeys(db());
    expect(reports.find((r) => r.target === 'two_step_factors.secret_sealed')).toMatchObject({ resealed: 1, unreadable: 0 });
    const [row] = await db().select().from(twoStepFactors).where(eq(twoStepFactors.userId, userId));
    expect(unseal(NEW, 'two-step.secret', row!.secretSealed)).toBe(secret);

    // The old key can go: the next code still works with the new key alone.
    keys({ TWO_STEP_KEY: NEW });
    const later = now + 60_000;
    const after = await db().transaction((tx) => verifySecondStep(tx, { userId, input: codeAt(secret, stepAt(later)), now: later }));
    expect(after).toMatchObject({ ok: true });
  });

  it('reseals Espacio Violeta text, leaves what neither key opens, and is idempotent', async () => {
    const userId = await member();
    const [m] = await db().insert(safeSpaceMembers).values({ userId, kind: 'member', handle: `Luna ${Math.floor(Math.random() * 1e6)}` }).returning();
    const mine = await db()
      .insert(safeSpaceRoomMessages)
      .values([
        { authorMemberId: m!.id, bodySealed: seal(OLD, 'safe-space.message', 'antes') },
        { authorMemberId: m!.id, bodySealed: seal(NEW, 'safe-space.message', 'después') },
        { authorMemberId: m!.id, bodySealed: seal(OTHER, 'safe-space.message', 'perdido') },
      ])
      .returning();

    keys({ SAFE_SPACE_KEY: NEW, SAFE_SPACE_KEY_PREVIOUS: OLD });
    const first = await resealUnderCurrentKeys(db());
    expect(first.find((r) => r.target === 'safe_space_room_messages.body_sealed')).toMatchObject({ resealed: 1, alreadyCurrent: 1, unreadable: 1 });

    const rows = await db().select().from(safeSpaceRoomMessages);
    const byId = new Map(rows.map((r) => [r.id, r.bodySealed]));
    expect(unseal(NEW, 'safe-space.message', byId.get(mine[0]!.id)!)).toBe('antes');
    expect(byId.get(mine[2]!.id)).toBe(mine[2]!.bodySealed);

    const second = await resealUnderCurrentKeys(db());
    expect(second.find((r) => r.target === 'safe_space_room_messages.body_sealed')).toMatchObject({ resealed: 0, alreadyCurrent: 2, unreadable: 1 });
  });

  it('does nothing without a previous key, and refuses a half-done rotation', async () => {
    keys({ TWO_STEP_KEY: NEW, SAFE_SPACE_KEY: NEW });
    expect(await resealUnderCurrentKeys(db())).toEqual([]);
    keys({ TWO_STEP_KEY_PREVIOUS: OLD });
    await expect(resealUnderCurrentKeys(db())).rejects.toThrow(/TWO_STEP_KEY_PREVIOUS is set but TWO_STEP_KEY/);
  });
});
