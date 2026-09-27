import { and, eq, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { reputationEvents, reputationRules, reputationScores } from '@/server/db/schema';
import { REPUTATION_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';

/**
 * Reputation.
 *
 * Every account starts at 500/1000 and moves only in response to verified
 * platform activity. Weights are read from the database (seeded from
 * `config/business-rules.ts`), never hard-coded at the call site, so they can
 * be tuned without a deploy.
 *
 * Each change is idempotent and recorded, so a Trust Shield can always be
 * explained and a mistaken penalty can be traced.
 */

export type ReputationSource =
  | 'verification'
  | 'transaction'
  | 'delivery'
  | 'review'
  | 'impact'
  | 'animals'
  | 'moderation'
  | 'admin';

export type ApplyResult = {
  applied: boolean;
  reason: 'applied' | 'duplicate' | 'cooldown' | 'daily_cap' | 'rule_disabled';
  score: number;
  delta: number;
};

/** Creates the initial score row. Idempotent. */
export async function initializeReputation(tx: Executor, userId: string): Promise<void> {
  await tx
    .insert(reputationScores)
    .values({ userId, score: REPUTATION_RULES.initialScore })
    .onConflictDoNothing({ target: reputationScores.userId });
}

export async function getScore(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .select({ score: reputationScores.score })
    .from(reputationScores)
    .where(eq(reputationScores.userId, userId))
    .limit(1);
  return row?.score ?? REPUTATION_RULES.initialScore;
}

/**
 * Applies a named reputation rule to a user.
 *
 * `idempotencyKey` must identify the *thing that happened* (an order id, a
 * verification id), not the moment of calling, so replays are harmless.
 */
export async function applyRule(
  tx: Executor,
  params: {
    userId: string;
    ruleKey: string;
    source: ReputationSource;
    idempotencyKey: string;
    relatedType?: string;
    relatedId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ApplyResult> {
  const [rule] = await tx
    .select()
    .from(reputationRules)
    .where(eq(reputationRules.key, params.ruleKey))
    .limit(1);

  if (!rule) throw errors.notFound('reputation_rule');

  // Lock the score row first: it serialises concurrent applications for this
  // user, so cooldown and daily-cap checks cannot both pass in a race.
  const locked = await tx
    .select({ userId: reputationScores.userId, score: reputationScores.score })
    .from(reputationScores)
    .where(eq(reputationScores.userId, params.userId))
    .limit(1)
    .for('update');

  let current = locked[0]?.score;
  if (current === undefined) {
    await initializeReputation(tx, params.userId);
    current = REPUTATION_RULES.initialScore;
  }

  if (!rule.enabled) {
    return { applied: false, reason: 'rule_disabled', score: current, delta: 0 };
  }

  const [duplicate] = await tx
    .select({ id: reputationEvents.id })
    .from(reputationEvents)
    .where(eq(reputationEvents.idempotencyKey, params.idempotencyKey))
    .limit(1);
  if (duplicate) {
    return { applied: false, reason: 'duplicate', score: current, delta: 0 };
  }

  if (rule.cooldownSeconds > 0) {
    const since = new Date(Date.now() - rule.cooldownSeconds * 1000);
    const [recent] = await tx
      .select({ id: reputationEvents.id })
      .from(reputationEvents)
      .where(
        and(
          eq(reputationEvents.userId, params.userId),
          eq(reputationEvents.ruleKey, params.ruleKey),
          gte(reputationEvents.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return { applied: false, reason: 'cooldown', score: current, delta: 0 };
  }

  if (rule.maxPerDay !== null) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(reputationEvents)
      .where(
        and(
          eq(reputationEvents.userId, params.userId),
          eq(reputationEvents.ruleKey, params.ruleKey),
          gte(reputationEvents.createdAt, since),
        ),
      );
    if (count >= rule.maxPerDay) {
      return { applied: false, reason: 'daily_cap', score: current, delta: 0 };
    }
  }

  const next = clampScore(current + rule.delta);
  const effectiveDelta = next - current;

  await tx
    .update(reputationScores)
    .set({
      score: next,
      successfulTransactions:
        params.ruleKey === 'successful_transaction'
          ? sql`${reputationScores.successfulTransactions} + 1`
          : reputationScores.successfulTransactions,
      successfulDeliveries:
        params.ruleKey === 'successful_delivery'
          ? sql`${reputationScores.successfulDeliveries} + 1`
          : reputationScores.successfulDeliveries,
      positiveReviews:
        params.ruleKey === 'verified_positive_review'
          ? sql`${reputationScores.positiveReviews} + 1`
          : reputationScores.positiveReviews,
      updatedAt: new Date(),
    })
    .where(eq(reputationScores.userId, params.userId));

  await tx.insert(reputationEvents).values({
    userId: params.userId,
    ruleKey: params.ruleKey,
    source: params.source,
    // Record the delta actually applied, which may be truncated at the bounds.
    delta: effectiveDelta,
    scoreAfter: next,
    idempotencyKey: params.idempotencyKey,
    relatedType: params.relatedType ?? null,
    relatedId: params.relatedId ?? null,
    metadata: { configuredDelta: rule.delta, ...(params.metadata ?? {}) },
  });

  return { applied: true, reason: 'applied', score: next, delta: effectiveDelta };
}

export function clampScore(value: number): number {
  return Math.min(REPUTATION_RULES.maximumScore, Math.max(REPUTATION_RULES.minimumScore, value));
}
