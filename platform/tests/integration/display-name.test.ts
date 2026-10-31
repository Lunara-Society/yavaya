import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { changeDisplayName, nameChangeQuote, recentPreviousName } from '@/server/domains/identity/display-name';
import { NAME_RULES } from '@/config/business-rules';
import { getBalance, grantStarterTokensForPeriod } from '@/server/domains/tokens/service';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'name-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member(tokens: number) {
  const { userId } = await register(
    db(),
    { email: `name-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Ana', locale: 'es', acceptedTerms: true },
    context,
  );
  const verifiedAt = new Date(Date.now() - 8 * 86_400_000);
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  // Two starter tokens per period: the only grant that needs no admin.
  for (let period = 0; period < Math.ceil(tokens / 2); period += 1) {
    await db().transaction((tx) => grantStarterTokensForPeriod(tx, { userId, verifiedAt, now: new Date(verifiedAt.getTime() + period * 86_400_000 + 1000) }));
  }
  return userId;
}

const rename = (userId: string, name: string, now?: Date) => db().transaction((tx) => changeDisplayName(tx, { userId, name, now }));
/** A moment past the wait between two changes. */
const afterWait = (days = NAME_RULES.cooldownDays + 1) => new Date(Date.now() + days * 86_400_000);
const nameOf = async (userId: string) => (await db().select({ name: users.displayName }).from(users).where(eq(users.id, userId)))[0]?.name;

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('changing the display name', () => {
  it('makes the first change free and charges a token for each one after', async () => {
    const userId = await member(2);
    expect(await nameChangeQuote(db(), userId)).toMatchObject({ freeLeft: 1, cost: 0 });

    expect(await rename(userId, '  Ana   María ')).toEqual({ displayName: 'Ana María', cost: 0 });
    expect(await getBalance(db(), userId)).toBe(2);
    expect(await nameChangeQuote(db(), userId)).toMatchObject({ freeLeft: 0, cost: 1 });

    expect(await rename(userId, 'Ana M.', afterWait())).toEqual({ displayName: 'Ana M.', cost: 1 });
    expect(await getBalance(db(), userId)).toBe(1);
    expect(await nameOf(userId)).toBe('Ana M.');
  });

  it('keeps the old and new name in the audit trail', async () => {
    const userId = await member(2);
    await rename(userId, 'Ana María');
    const [audit] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'identity.display_name_changed'));
    expect(audit?.metadata).toMatchObject({ from: 'Ana', to: 'Ana María', change: 1, cost: 0 });
  });

  it('refuses the same name and a name out of bounds, without using the free change', async () => {
    const userId = await member(2);
    await expect(rename(userId, 'Ana')).rejects.toMatchObject({ messageKey: 'settings.name.same' });
    await expect(rename(userId, 'A')).rejects.toMatchObject({ messageKey: 'settings.name.invalid' });
    await expect(rename(userId, 'x'.repeat(61))).rejects.toMatchObject({ messageKey: 'settings.name.invalid' });
    expect(await nameChangeQuote(db(), userId)).toMatchObject({ freeLeft: 1 });
  });

  it('keeps the old name when a paid change cannot be paid', async () => {
    const userId = await member(0);
    await rename(userId, 'Ana María');
    await expect(rename(userId, 'Ana M.', afterWait())).rejects.toMatchObject({ code: 'insufficient_tokens' });
    expect(await nameOf(userId)).toBe('Ana María');
    expect(await nameChangeQuote(db(), userId)).toMatchObject({ freeLeft: 0 });
  });

  it('spaces changes out, paid or not, and refuses one too soon without charging', async () => {
    const userId = await member(4);
    await rename(userId, 'Ana María');
    await expect(rename(userId, 'Ana M.')).rejects.toMatchObject({ messageKey: 'settings.name.too_soon' });
    await expect(rename(userId, 'Ana M.', afterWait(NAME_RULES.cooldownDays - 1))).rejects.toMatchObject({ messageKey: 'settings.name.too_soon' });
    expect(await getBalance(db(), userId)).toBe(4);
    expect((await nameChangeQuote(db(), userId)).allowedFrom).not.toBeNull();
    await rename(userId, 'Ana M.', afterWait());
    expect(await getBalance(db(), userId)).toBe(3);
  });

  it('shows the previous name on the profile for a while after a change, then stops', async () => {
    const userId = await member(2);
    await rename(userId, 'Ana María');
    const [row] = await db().select({ previousDisplayName: users.previousDisplayName, nameChangedAt: users.nameChangedAt }).from(users).where(eq(users.id, userId));
    expect(await recentPreviousName(db(), row!)).toMatchObject({ name: 'Ana' });
    expect(await recentPreviousName(db(), row!, new Date(Date.now() + (NAME_RULES.showPreviousDays + 1) * 86_400_000))).toBeNull();
  });
});
