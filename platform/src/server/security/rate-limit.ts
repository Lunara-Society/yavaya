import { sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { rateLimitCounters } from '@/server/db/schema';

/**
 * Server-side rate limiting.
 *
 * Counters live in the database, keyed by an opaque subject, so a client
 * cannot reset them and so limits hold across instances. This is a fixed
 * window: simple, predictable, and adequate for abuse control. Anything
 * needing smoother behaviour (a payment provider's own quota, for example)
 * should not reuse this.
 */

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Bucket name, e.g. `login`, `register`, `verify_code`. */
  bucket: string;
  limit: number;
  windowSeconds: number;
};

/** Limits applied to unauthenticated and abuse-sensitive endpoints. */
export const RATE_LIMITS = {
  login: { bucket: 'login', limit: 8, windowSeconds: 15 * 60 },
  register: { bucket: 'register', limit: 5, windowSeconds: 60 * 60 },
  verifyCode: { bucket: 'verify_code', limit: 10, windowSeconds: 15 * 60 },
  resendCode: { bucket: 'resend_code', limit: 5, windowSeconds: 60 * 60 },
  report: { bucket: 'report', limit: 20, windowSeconds: 60 * 60 },
  /** Publishing during the 72-hour monitoring window. */
  publishMonitored: { bucket: 'publish_monitored', limit: 10, windowSeconds: 60 * 60 },
  publishStandard: { bucket: 'publish_standard', limit: 60, windowSeconds: 60 * 60 },
  /** Replies in Community: enough for a real conversation, not for flooding one. */
  communityReply: { bucket: 'community_reply', limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Consumes one unit from a bucket.
 *
 * The upsert is a single statement so concurrent requests cannot both read a
 * stale count. An expired window is reset in the same statement.
 */
export async function consumeRateLimit(
  executor: Executor,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitDecision> {
  const key = `${rule.bucket}:${subject}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + rule.windowSeconds * 1000);

  // The new window is derived inside SQL rather than passed as a timestamp
  // parameter: `now()` is the database's clock, which keeps windows consistent
  // across application instances whose clocks may differ.
  const windowInterval = sql`(${rule.windowSeconds} * interval '1 second')`;

  const rows = await executor
    .insert(rateLimitCounters)
    .values({ key, windowStart: now, count: '1', expiresAt })
    .onConflictDoUpdate({
      target: rateLimitCounters.key,
      set: {
        count: sql`case when ${rateLimitCounters.expiresAt} <= now() then '1'
                       else (${rateLimitCounters.count}::bigint + 1)::text end`,
        windowStart: sql`case when ${rateLimitCounters.expiresAt} <= now() then now()
                              else ${rateLimitCounters.windowStart} end`,
        expiresAt: sql`case when ${rateLimitCounters.expiresAt} <= now() then now() + ${windowInterval}
                            else ${rateLimitCounters.expiresAt} end`,
      },
    })
    .returning({ count: rateLimitCounters.count, expiresAt: rateLimitCounters.expiresAt });

  const row = rows[0];
  if (!row) return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };

  const count = Number(row.count);
  const remaining = Math.max(0, rule.limit - count);
  const retryAfterSeconds = Math.max(0, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000));

  return { allowed: count <= rule.limit, remaining, retryAfterSeconds };
}

/** Reads a bucket without consuming from it. */
export async function peekRateLimit(
  executor: Executor,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitDecision> {
  const key = `${rule.bucket}:${subject}`;
  const [row] = await executor
    .select({ count: rateLimitCounters.count, expiresAt: rateLimitCounters.expiresAt })
    .from(rateLimitCounters)
    .where(sql`${rateLimitCounters.key} = ${key} and ${rateLimitCounters.expiresAt} > now()`)
    .limit(1);

  if (!row) return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  const count = Number(row.count);
  return {
    allowed: count < rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

/** Housekeeping for expired counters. */
export async function purgeExpiredRateLimits(executor: Executor): Promise<void> {
  await executor.delete(rateLimitCounters).where(sql`${rateLimitCounters.expiresAt} <= now()`);
}
