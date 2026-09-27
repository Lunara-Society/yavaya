import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { reputationScores, users } from '@/server/db/schema';
import { TRUST_BANDS } from '@/config/business-rules';
import { formatYayId } from '@/server/domains/identity/yay-id';

/**
 * Trust Shield.
 *
 * A public, deliberately narrow summary of how trustworthy an account is. It
 * communicates trust without leaking anything sensitive.
 *
 * What it may never contain: reports filed about or by the user, addresses,
 * identity documents, phone numbers, email addresses, moderation notes, risk
 * scores, or the reasons behind a moderation decision. The shape of this type
 * is the boundary — if a field is not here, it does not reach the client.
 */
export type TrustShield = {
  yayId: string;
  displayName: string;
  identityVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Whole days since registration. */
  accountAgeDays: number;
  trustScore: number;
  successfulTransactions: number;
  /** i18n key, e.g. `trust.status.trusted`. Never a rendered sentence. */
  statusKey: string;
  /** Set only for accounts an ordinary user should approach with care. */
  cautionKey: string | null;
};

export async function buildTrustShield(
  executor: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<TrustShield | null> {
  const [row] = await executor
    .select({
      yayId: users.yayId,
      displayName: users.displayName,
      status: users.status,
      trustState: users.trustState,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      identityVerifiedAt: users.identityVerifiedAt,
      score: reputationScores.score,
      successfulTransactions: reputationScores.successfulTransactions,
    })
    .from(users)
    .leftJoin(reputationScores, eq(reputationScores.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - row.createdAt.getTime()) / 86_400_000),
  );
  const score = row.score ?? 50;

  return {
    yayId: formatYayId(row.yayId),
    displayName: row.displayName,
    identityVerified: row.identityVerifiedAt !== null,
    emailVerified: row.emailVerifiedAt !== null,
    phoneVerified: row.phoneVerifiedAt !== null,
    accountAgeDays,
    trustScore: score,
    successfulTransactions: row.successfulTransactions ?? 0,
    statusKey: statusKeyFor({ status: row.status, trustState: row.trustState, score }),
    cautionKey: cautionKeyFor({ status: row.status, trustState: row.trustState, accountAgeDays }),
  };
}

/**
 * Status is derived, never stored — so it cannot drift from the evidence, and
 * cannot be set by hand to make an account look better than it is.
 */
export function statusKeyFor(input: {
  status: string;
  trustState: string;
  score: number;
}): string {
  if (input.status === 'banned') return 'trust.status.removed';
  if (input.status === 'suspended') return 'trust.status.suspended';
  if (input.status === 'restricted') return 'trust.status.restricted';
  if (input.status === 'pending_verification') return 'trust.status.unverified';
  if (input.trustState === 'monitored') return 'trust.status.new_member';

  const band = [...TRUST_BANDS]
    .sort((a, b) => b.minScore - a.minScore)
    .find((candidate) => input.score >= candidate.minScore);

  return `trust.status.${band?.key ?? 'new'}`;
}

/**
 * A caution is shown when an ordinary user genuinely should take more care —
 * a very new account, or one under restriction. It is not a moderation
 * disclosure and never explains why.
 */
export function cautionKeyFor(input: {
  status: string;
  trustState: string;
  accountAgeDays: number;
}): string | null {
  if (input.status === 'restricted') return 'trust.caution.restricted';
  if (input.trustState === 'monitored' || input.accountAgeDays < 3) return 'trust.caution.new_account';
  return null;
}
