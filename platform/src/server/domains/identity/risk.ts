import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { accountSignals, riskAssessments, sharedNetworks, users } from '@/server/db/schema';
import { RISK_RULES } from '@/config/business-rules';
import { signalHash } from '@/server/security/crypto';

/**
 * Duplicate-account risk scoring.
 *
 * "One person, one account" is enforced by *layered* evidence, never by a
 * single signal. The output of this module is a score and an explanation, not
 * a verdict:
 *
 *   low       → proceed
 *   elevated  → proceed, keep watching
 *   review    → proceed, open a human review case
 *   block     → do not complete this action; a human decides what happens next
 *
 * Deliberate properties:
 *  - No individual signal weight reaches `blockAt`, so no one signal can
 *    restrict an account on its own.
 *  - A network match on a known shared network is downgraded to near-noise.
 *    Shared Wi-Fi, families, offices, VPNs and mobile carriers must not
 *    produce bans.
 *  - Every factor that contributed is stored, so a decision can be explained
 *    to a moderator and contested by the user.
 */

export type RiskFactor = { code: string; weight: number; detail?: string };
export type RiskBand = 'low' | 'elevated' | 'review' | 'block';

export type RiskEvaluation = {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
  /** Existing accounts that share evidence with this one. */
  matchedUserIds: string[];
};

export type RiskInput = {
  /** Canonical email, used to derive the folded signal form. */
  emailSignal: string;
  emailDomain: string;
  phoneE164?: string | null;
  deviceFingerprint?: string | null;
  networkHash?: string | null;
  /** Set for an existing account being re-evaluated. */
  subjectUserId?: string | null;
  /** Domains known to hand out throwaway addresses. */
  disposableDomains?: ReadonlySet<string>;
};

export async function evaluateRisk(
  executor: Executor,
  input: RiskInput,
): Promise<RiskEvaluation> {
  const factors: RiskFactor[] = [];
  const matched = new Set<string>();
  const weights = RISK_RULES.weights;

  // --- Email folding match ---------------------------------------------------
  const emailHash = signalHash('email_normalized', input.emailSignal);
  const emailMatches = await findSignalOwners(executor, 'email_normalized', emailHash, input.subjectUserId);
  if (emailMatches.length > 0) {
    factors.push({
      code: 'email_alias_match',
      weight: weights.emailAliasMatch,
      detail: `${emailMatches.length} account(s)`,
    });
    emailMatches.forEach((id) => matched.add(id));
  }

  if (input.disposableDomains?.has(input.emailDomain)) {
    factors.push({ code: 'email_domain_disposable', weight: weights.emailDomainDisposable });
  }

  // --- Phone match -----------------------------------------------------------
  // The strongest single signal, because a verified number is expensive to
  // duplicate — but still below the block threshold on its own.
  if (input.phoneE164) {
    const phoneHash = signalHash('phone_e164', input.phoneE164);
    const phoneMatches = await findSignalOwners(executor, 'phone_e164', phoneHash, input.subjectUserId);
    if (phoneMatches.length > 0) {
      factors.push({
        code: 'phone_match',
        weight: weights.phoneMatch,
        detail: `${phoneMatches.length} account(s)`,
      });
      phoneMatches.forEach((id) => matched.add(id));
    }
  }

  // --- Device match ----------------------------------------------------------
  if (input.deviceFingerprint) {
    const deviceHash = signalHash('device_fingerprint', input.deviceFingerprint);
    const deviceMatches = await findSignalOwners(
      executor,
      'device_fingerprint',
      deviceHash,
      input.subjectUserId,
    );
    if (deviceMatches.length > 0) {
      factors.push({
        code: 'device_exact_match',
        weight: weights.exactDeviceMatch,
        detail: `${deviceMatches.length} account(s)`,
      });
      deviceMatches.forEach((id) => matched.add(id));
    }
  }

  // --- Network match ---------------------------------------------------------
  if (input.networkHash) {
    const shared = await isSharedNetwork(executor, input.networkHash);
    const networkMatches = await findSignalOwners(
      executor,
      'ip_network',
      input.networkHash,
      input.subjectUserId,
    );
    if (networkMatches.length > 0) {
      factors.push({
        code: shared ? 'network_match_shared_range' : 'network_match',
        weight: shared ? weights.sameIpNetworkSharedRange : weights.sameIpNetwork,
        detail: shared ? 'known shared network' : `${networkMatches.length} account(s)`,
      });
      // A network match alone is not evidence of the same person, so matched
      // accounts are only recorded when some other signal already agrees.
      if (!shared && factors.some((factor) => factor.code !== 'network_match' && factor.weight >= 15)) {
        networkMatches.forEach((id) => matched.add(id));
      }
    }

    // A burst of registrations from one network in a short window is a
    // behavioural signal, distinct from simply sharing a network.
    const burst = await recentRegistrationsFromNetwork(executor, input.networkHash);
    if (burst >= 3) {
      factors.push({
        code: 'rapid_registration_burst',
        weight: weights.rapidRegistrationBurst,
        detail: `${burst} in 1h`,
      });
    }
  }

  const score = clamp(factors.reduce((total, factor) => total + factor.weight, 0), 0, 100);
  return { score, band: bandFor(score), factors, matchedUserIds: [...matched] };
}

export function bandFor(score: number): RiskBand {
  if (score >= RISK_RULES.blockAt) return 'block';
  if (score >= RISK_RULES.reviewAt) return 'review';
  if (score >= Math.floor(RISK_RULES.reviewAt / 2)) return 'elevated';
  return 'low';
}

/** Persists an evaluation so an enforcement decision can always be explained. */
export async function storeAssessment(
  tx: Executor,
  params: { userId: string | null; context: string; evaluation: RiskEvaluation },
): Promise<string> {
  const [row] = await tx
    .insert(riskAssessments)
    .values({
      userId: params.userId,
      context: params.context,
      score: params.evaluation.score,
      band: params.evaluation.band,
      factors: params.evaluation.factors,
    })
    .returning({ id: riskAssessments.id });
  if (!row) throw new Error('risk assessment insert returned no row');
  return row.id;
}

/** Records the signals observed for an account, for future comparisons. */
export async function recordSignals(
  tx: Executor,
  params: {
    userId: string;
    emailSignal: string;
    emailDomain: string;
    phoneE164?: string | null;
    deviceFingerprint?: string | null;
    networkHash?: string | null;
  },
): Promise<void> {
  const rows: Array<{ kind: 'email_normalized' | 'email_domain' | 'phone_e164' | 'device_fingerprint' | 'ip_network'; valueHash: string }> = [
    { kind: 'email_normalized', valueHash: signalHash('email_normalized', params.emailSignal) },
    { kind: 'email_domain', valueHash: signalHash('email_domain', params.emailDomain) },
  ];
  if (params.phoneE164) {
    rows.push({ kind: 'phone_e164', valueHash: signalHash('phone_e164', params.phoneE164) });
  }
  if (params.deviceFingerprint) {
    rows.push({
      kind: 'device_fingerprint',
      valueHash: signalHash('device_fingerprint', params.deviceFingerprint),
    });
  }
  if (params.networkHash) {
    rows.push({ kind: 'ip_network', valueHash: params.networkHash });
  }

  for (const row of rows) {
    await tx
      .insert(accountSignals)
      .values({ userId: params.userId, kind: row.kind, valueHash: row.valueHash })
      .onConflictDoUpdate({
        target: [accountSignals.userId, accountSignals.kind, accountSignals.valueHash],
        set: {
          occurrences: sql`${accountSignals.occurrences} + 1`,
          observedAt: new Date(),
        },
      });
  }
}

async function findSignalOwners(
  executor: Executor,
  kind: 'email_normalized' | 'phone_e164' | 'device_fingerprint' | 'ip_network',
  valueHash: string,
  excludeUserId?: string | null,
): Promise<string[]> {
  const conditions = [eq(accountSignals.kind, kind), eq(accountSignals.valueHash, valueHash)];
  if (excludeUserId) conditions.push(ne(accountSignals.userId, excludeUserId));

  const rows = await executor
    .select({ userId: accountSignals.userId })
    .from(accountSignals)
    .where(and(...conditions))
    .limit(50);

  if (rows.length === 0) return [];

  // Removed accounts still hold signals; only live accounts count as evidence
  // that a *person* already has an account.
  const live = await executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(
          users.id,
          rows.map((row) => row.userId),
        ),
        ne(users.status, 'banned'),
      ),
    );

  return live.map((row) => row.id);
}

async function isSharedNetwork(executor: Executor, networkHash: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: sharedNetworks.id })
    .from(sharedNetworks)
    .where(eq(sharedNetworks.networkHash, networkHash))
    .limit(1);
  return Boolean(row);
}

async function recentRegistrationsFromNetwork(
  executor: Executor,
  networkHash: string,
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await executor
    .select({ count: sql<number>`count(distinct ${accountSignals.userId})::int` })
    .from(accountSignals)
    .where(
      and(
        eq(accountSignals.kind, 'ip_network'),
        eq(accountSignals.valueHash, networkHash),
        gte(accountSignals.observedAt, since),
      ),
    );
  return row?.count ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Records a verified phone number as a signal, so a number that verifies
 * several accounts is visible to duplicate detection. It is a signal only:
 * families share phones, and whether one number may verify more than one
 * account is an open decision (docs/CONFIGURATION.md).
 */
export async function recordPhoneSignal(tx: Executor, params: { userId: string; phoneE164: string }): Promise<void> {
  await tx
    .insert(accountSignals)
    .values({ userId: params.userId, kind: 'phone_e164', valueHash: signalHash('phone_e164', params.phoneE164) })
    .onConflictDoUpdate({
      target: [accountSignals.userId, accountSignals.kind, accountSignals.valueHash],
      set: { occurrences: sql`${accountSignals.occurrences} + 1`, observedAt: new Date() },
    });
}
