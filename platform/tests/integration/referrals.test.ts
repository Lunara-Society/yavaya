import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, referrals, systemSettings, users } from '@/server/db/schema';
import { consumeVerificationCode, register } from '@/server/domains/identity/service';
import { getBalance } from '@/server/domains/tokens/service';
import { invitationSummary } from '@/server/domains/referrals/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { REFERRAL_RULES, TOKEN_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/** Each member registers from their own device and network, unless told otherwise. */
function contextFor(device: string) {
  return { networkHash: `net-${device}`, addressHash: `addr-${crypto.randomUUID()}`, deviceFingerprint: `dev-${device}`, userAgent: 'vitest' };
}

async function join(options: { inviter?: string; device?: string; verify?: boolean } = {}) {
  const created = await register(
    db(),
    {
      email: `ref-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Invitada',
      locale: 'es',
      acceptedTerms: true,
      inviter: options.inviter,
    },
    contextFor(options.device ?? crypto.randomUUID()),
  );
  if (options.verify !== false) {
    await consumeVerificationCode(db(), { userId: created.userId, kind: 'email', code: created.emailVerificationCode });
  }
  return created;
}

const starterDay0 = TOKEN_RULES.starterGrantPerDay;

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await db().update(systemSettings).set({ value: REFERRAL_RULES.maxRewardedPerMonth as never }).where(eq(systemSettings.key, 'referral.max_rewarded_per_month'));
  clearSettingsCache();
  await closeDb();
});

describe('invitations', () => {
  it('thanks both people once the invited account verifies its email', async () => {
    const inviter = await join();
    const before = await getBalance(db(), inviter.userId);

    const friend = await join({ inviter: formatYayId(inviter.yayId), verify: false });
    // Nothing is paid for an account that has not proved its email.
    expect(await getBalance(db(), inviter.userId)).toBe(before);

    await consumeVerificationCode(db(), { userId: friend.userId, kind: 'email', code: friend.emailVerificationCode });
    expect(await getBalance(db(), inviter.userId)).toBe(before + REFERRAL_RULES.inviterReward);
    expect(await getBalance(db(), friend.userId)).toBe(starterDay0 + REFERRAL_RULES.inviteeReward);

    const summary = await invitationSummary(db(), inviter.userId);
    expect(summary).toMatchObject({ joined: 1, rewarded: 1, earned: REFERRAL_RULES.inviterReward });
    const [audit] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'referral.rewarded'));
    expect(audit?.subjectId).toBe(friend.userId);
  });

  it('pays nothing for what looks like the same person inviting themselves', async () => {
    const inviter = await join({ device: 'shared' });
    const before = await getBalance(db(), inviter.userId);
    const twin = await join({ inviter: formatYayId(inviter.yayId), device: 'shared' });

    const [row] = await db().select().from(referrals).where(eq(referrals.inviteeUserId, twin.userId));
    expect(row?.suspect).toBe(true);
    expect(row?.rewardedAt).toBeNull();
    expect(await getBalance(db(), inviter.userId)).toBe(before);
  });

  it('ignores unknown codes and inviters who are not in good standing', async () => {
    const stranger = await join({ inviter: 'YAY-00000000' });
    expect(await db().select().from(referrals).where(eq(referrals.inviteeUserId, stranger.userId))).toHaveLength(0);

    const inviter = await join();
    await db().update(users).set({ status: 'suspended' }).where(eq(users.id, inviter.userId));
    const friend = await join({ inviter: formatYayId(inviter.yayId) });
    expect(await db().select().from(referrals).where(eq(referrals.inviteeUserId, friend.userId))).toHaveLength(0);
  });

  it('stops paying past the monthly maximum, without blocking the invitation', async () => {
    // Other suites may have cleared the settings table: write the row outright.
    await db()
      .insert(systemSettings)
      .values({ key: 'referral.max_rewarded_per_month', value: 1 as never, description: 'test' })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: 1 as never } });
    clearSettingsCache();
    const inviter = await join();
    const before = await getBalance(db(), inviter.userId);
    await join({ inviter: formatYayId(inviter.yayId) });
    const second = await join({ inviter: formatYayId(inviter.yayId) });

    expect(await getBalance(db(), inviter.userId)).toBe(before + REFERRAL_RULES.inviterReward);
    expect(await getBalance(db(), second.userId)).toBe(starterDay0);
    expect((await invitationSummary(db(), inviter.userId)).joined).toBe(2);
  });
});
