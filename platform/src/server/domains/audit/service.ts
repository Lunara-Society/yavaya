import { createHash } from 'node:crypto';
import { asc, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';

/**
 * Audit service.
 *
 * Records are append-only (enforced by a database trigger) and hash-chained:
 * each row's hash covers its own canonical content plus the previous row's
 * hash. Deleting or rewriting history — even with direct database access —
 * breaks the chain at a detectable point.
 */

export type ActorType = 'user' | 'admin' | 'system' | 'anonymous';

export type AuditInput = {
  actorType: ActorType;
  actorUserId?: string | null;
  /** Dotted, stable, machine-readable: `tokens.admin_grant`. */
  action: string;
  subjectType: string;
  subjectId?: string | null;
  district?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  /** Non-sensitive structured detail. Never a secret, document or raw IP. */
  metadata?: Record<string, unknown>;
};

/**
 * Advisory lock key that serialises chain appends within a transaction.
 * Chosen arbitrarily; it only has to be unique inside this application.
 */
const AUDIT_CHAIN_LOCK = 4_120_797_001;

/**
 * Appends an audit record.
 *
 * Must run inside the same transaction as the action it describes, so an
 * action can never commit without its audit trail (or vice versa).
 */
export async function recordAudit(
  tx: Executor,
  input: AuditInput,
): Promise<{ id: bigint; hash: string }> {
  // Serialise appenders so two concurrent transactions cannot both read the
  // same predecessor and fork the chain.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

  const previous = await tx
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .orderBy(sql`${auditEvents.id} DESC`)
    .limit(1);

  const prevHash = previous[0]?.hash ?? null;
  const occurredAt = new Date();
  const metadata = input.metadata ?? {};

  const hash = computeEventHash(prevHash, {
    occurredAt: occurredAt.toISOString(),
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    district: input.district ?? null,
    ipHash: input.ipHash ?? null,
    userAgentHash: input.userAgentHash ?? null,
    metadata,
  });

  const [row] = await tx
    .insert(auditEvents)
    .values({
      occurredAt,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      district: input.district ?? null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      metadata,
      prevHash,
      hash,
    })
    .returning({ id: auditEvents.id, hash: auditEvents.hash });

  if (!row) throw new Error('audit insert returned no row');
  return row;
}

type HashableEvent = {
  occurredAt: string;
  actorType: string;
  actorUserId: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  district: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  metadata: Record<string, unknown>;
};

export function computeEventHash(prevHash: string | null, event: HashableEvent): string {
  return createHash('sha256')
    .update(prevHash ?? 'genesis')
    .update('\n')
    .update(canonicalize(event))
    .digest('hex');
}

/**
 * Deterministic JSON: object keys sorted at every depth, so two structurally
 * identical payloads always hash identically regardless of insertion order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

export type ChainVerification =
  | { valid: true; checked: number }
  | { valid: false; checked: number; brokenAtId: string; reason: 'hash_mismatch' | 'link_mismatch' };

/**
 * Recomputes the chain from the beginning and reports the first inconsistency.
 * Intended for an operations command and a scheduled integrity check.
 */
export async function verifyAuditChain(
  executor: Executor,
  options: { limit?: number } = {},
): Promise<ChainVerification> {
  const rows = await executor
    .select()
    .from(auditEvents)
    .orderBy(asc(auditEvents.id))
    .limit(options.limit ?? 100_000);

  let expectedPrev: string | null = null;
  let checked = 0;

  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return { valid: false, checked, brokenAtId: String(row.id), reason: 'link_mismatch' };
    }
    const recomputed = computeEventHash(row.prevHash, {
      occurredAt: row.occurredAt.toISOString(),
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      district: row.district,
      ipHash: row.ipHash,
      userAgentHash: row.userAgentHash,
      metadata: row.metadata,
    });
    if (recomputed !== row.hash) {
      return { valid: false, checked, brokenAtId: String(row.id), reason: 'hash_mismatch' };
    }
    expectedPrev = row.hash;
    checked += 1;
  }

  return { valid: true, checked };
}
