import { and, isNull, lte } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { demoContent } from '@/server/db/schema';
import { DEMO_CONTENT_RULES } from '@/config/business-rules';
import { recordAudit } from '@/server/domains/audit/service';
import { getSetting, isFlagEnabled } from './settings';

/**
 * Demo content.
 *
 * Demo rows exist only to make an empty launch legible. The rules are absolute:
 *  - every demo row is registered here and rendered with a visible DEMO marker;
 *  - demo rows never count towards any statistic;
 *  - demo rows never generate an activity notification;
 *  - demo rows expire automatically, and an administrator can end demo mode at
 *    any time.
 *
 * Anything that queries content for a real user-facing count must exclude
 * registered demo subjects. `isDemoSubject` and `demoSubjectIds` exist for that.
 */

export const DEMO_MODE_FLAG = 'demo_mode';

export async function isDemoModeEnabled(executor: Executor): Promise<boolean> {
  return isFlagEnabled(executor, DEMO_MODE_FLAG, DEMO_CONTENT_RULES.defaultEnabled);
}

export async function demoLifetimeDays(executor: Executor): Promise<number> {
  const configured = await getSetting<number>(
    executor,
    'demo.lifetime_days',
    DEMO_CONTENT_RULES.defaultLifetimeDays,
  );
  return Math.min(
    DEMO_CONTENT_RULES.maximumLifetimeDays,
    Math.max(DEMO_CONTENT_RULES.minimumLifetimeDays, configured),
  );
}

/** Registers a row as demo content. Called wherever demo data is created. */
export async function markAsDemo(
  tx: Executor,
  params: {
    subjectType: string;
    subjectId: string;
    district?: string | null;
    createdBy?: string | null;
    lifetimeDays: number;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + params.lifetimeDays * 86_400_000);
  await tx
    .insert(demoContent)
    .values({
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      district: params.district ?? null,
      createdBy: params.createdBy ?? null,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [demoContent.subjectType, demoContent.subjectId],
      set: { expiresAt, removedAt: null },
    });
}

/**
 * Expires demo rows that have reached their lifetime.
 *
 * Returns what expired so the caller can remove the underlying rows in the
 * same run — this module tracks demo content, it does not own other domains'
 * tables.
 */
export async function expireDueDemoContent(
  database: Database,
  now: Date = new Date(),
): Promise<Array<{ subjectType: string; subjectId: string; district: string | null }>> {
  return database.transaction(async (tx) => {
    const due = await tx
      .update(demoContent)
      .set({ removedAt: now })
      .where(and(lte(demoContent.expiresAt, now), isNull(demoContent.removedAt)))
      .returning({
        subjectType: demoContent.subjectType,
        subjectId: demoContent.subjectId,
        district: demoContent.district,
      });

    if (due.length > 0) {
      await recordAudit(tx, {
        actorType: 'system',
        action: 'platform.demo_content_expired',
        subjectType: 'demo_content',
        metadata: { count: due.length },
      });
    }

    return due;
  });
}

/**
 * Ends demo mode early because a district now has enough real content.
 * Threshold is configurable; the caller supplies the real count it measured.
 */
export async function shouldEndDemoForDistrict(
  executor: Executor,
  realItemCount: number,
): Promise<boolean> {
  const threshold = await getSetting<number>(
    executor,
    'demo.real_inventory_threshold',
    DEMO_CONTENT_RULES.realInventoryThreshold,
  );
  return realItemCount >= threshold;
}
