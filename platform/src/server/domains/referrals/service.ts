import { and, count, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { referrals, rewardGrants, users } from '@/server/db/schema';
import { REFERRAL_RULES } from '@/config/business-rules';
import { getSetting } from '@/server/domains/platform/settings';
import { grantReward } from '@/server/domains/tokens/service';
import { recordAudit } from '@/server/domains/audit/service';
import { parseYayId, formatYayId } from '@/server/domains/identity/yay-id';

/**
 * Invitations: a member shares a link, a friend joins, and once the friend's
 * email is verified both are thanked in tokens. It is the free way to get
 * tokens, and how Yavaya grows from person to person rather than by ads.
 *
 * Tokens never move here directly: rewards go through `grantReward`, which is
 * idempotent per invitee, so a retried verification cannot pay twice.
 */

export async function referralRules(executor: Executor) {
  const [inviterReward, inviteeReward, maxRewardedPerMonth] = await Promise.all([
    getSetting(executor, 'referral.inviter_reward', REFERRAL_RULES.inviterReward),
    getSetting(executor, 'referral.invitee_reward', REFERRAL_RULES.inviteeReward),
    getSetting(executor, 'referral.max_rewarded_per_month', REFERRAL_RULES.maxRewardedPerMonth),
  ]);
  return { inviterReward, inviteeReward, maxRewardedPerMonth };
}

/**
 * Called inside registration. An unknown, inactive or self-referencing code
 * is ignored silently: the person is registering, not applying for a reward,
 * and a bad link must never stand between them and an account.
 */
export async function recordReferral(
  tx: Executor,
  params: { inviteeUserId: string; inviterCode: string; matchedUserIds: readonly string[] },
): Promise<void> {
  const digits = parseYayId(params.inviterCode);
  if (!digits) return;
  const [inviter] = await tx
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.yayId, digits))
    .limit(1);
  if (!inviter || inviter.id === params.inviteeUserId || inviter.status !== 'active') return;
  await tx
    .insert(referrals)
    .values({
      inviteeUserId: params.inviteeUserId,
      inviterUserId: inviter.id,
      suspect: params.matchedUserIds.includes(inviter.id),
    })
    .onConflictDoNothing({ target: referrals.inviteeUserId });
}

/**
 * Called when an invited account verifies its email. Pays both sides once,
 * unless the invitation looked like self-referral, the inviter is no longer
 * in good standing, or the inviter already earned the monthly maximum.
 */
export async function rewardReferral(
  tx: Executor,
  params: { inviteeUserId: string; now?: Date },
): Promise<{ rewarded: boolean }> {
  const now = params.now ?? new Date();
  const [row] = await tx
    .select({ inviterUserId: referrals.inviterUserId, suspect: referrals.suspect, rewardedAt: referrals.rewardedAt, inviterStatus: users.status })
    .from(referrals)
    .innerJoin(users, eq(users.id, referrals.inviterUserId))
    .where(eq(referrals.inviteeUserId, params.inviteeUserId))
    .limit(1)
    .for('update', { of: referrals });
  if (!row || row.rewardedAt || row.suspect || row.inviterStatus !== 'active') return { rewarded: false };

  const rules = await referralRules(tx);
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [recent] = await tx
    .select({ n: count() })
    .from(referrals)
    .where(and(eq(referrals.inviterUserId, row.inviterUserId), isNotNull(referrals.rewardedAt), gte(referrals.rewardedAt, since)));
  if ((recent?.n ?? 0) >= rules.maxRewardedPerMonth) return { rewarded: false };

  await grantReward(tx, { userId: row.inviterUserId, ruleKey: 'referral.inviter', amount: rules.inviterReward, dedupeKey: params.inviteeUserId, reason: 'referral' });
  await grantReward(tx, { userId: params.inviteeUserId, ruleKey: 'referral.invitee', amount: rules.inviteeReward, dedupeKey: params.inviteeUserId, reason: 'referral' });
  await tx.update(referrals).set({ rewardedAt: now }).where(eq(referrals.inviteeUserId, params.inviteeUserId));
  await recordAudit(tx, {
    actorType: 'system',
    action: 'referral.rewarded',
    subjectType: 'user',
    subjectId: params.inviteeUserId,
    metadata: { inviterUserId: row.inviterUserId, inviterReward: rules.inviterReward, inviteeReward: rules.inviteeReward },
  });
  return { rewarded: true };
}

/** What the invite page shows: the member's own link and how it has done. */
export async function invitationSummary(executor: Executor, userId: string) {
  const [[me], [totals], [paid], rules] = await Promise.all([
    executor.select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1),
    executor
      .select({
        joined: count(),
        rewarded: sql<number>`count(${referrals.rewardedAt})::int`,
      })
      .from(referrals)
      .where(eq(referrals.inviterUserId, userId)),
    // What was actually paid, not a multiplication: the reward may have changed.
    executor
      .select({ total: sql<number>`coalesce(sum(${rewardGrants.amount}), 0)::int` })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.ruleKey, 'referral.inviter'))),
    referralRules(executor),
  ]);
  return {
    code: me ? formatYayId(me.yayId) : null,
    joined: totals?.joined ?? 0,
    rewarded: totals?.rewarded ?? 0,
    earned: paid?.total ?? 0,
    rules,
  };
}
