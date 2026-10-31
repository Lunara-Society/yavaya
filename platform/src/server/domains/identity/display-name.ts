import 'server-only';
import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { NAME_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { getSetting } from '@/server/domains/platform/settings';
import { actionCost, chargeForAction } from '@/server/domains/tokens/service';
import { recordAudit } from '@/server/domains/audit/service';
import { normalizeDisplayName } from './normalize';
import { registrationSchema } from './service';

export const NAME_CHANGE_ACTION = 'identity.change_name';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a member whose name last changed at `changedAt` may change it again. */
export function nextNameChangeAt(changedAt: Date | null, cooldownDays: number): Date | null {
  return changedAt ? new Date(changedAt.getTime() + cooldownDays * DAY_MS) : null;
}

/**
 * What the member's next name change costs (0 while a free change is left),
 * and from when it is allowed: null when it is allowed now.
 */
export async function nameChangeQuote(
  executor: Executor,
  userId: string,
  now = new Date(),
): Promise<{ freeLeft: number; cost: number | null; allowedFrom: Date | null; cooldownDays: number; showPreviousDays: number }> {
  const [[user], free, price, cooldownDays, showPreviousDays] = await Promise.all([
    executor.select({ nameChanges: users.nameChanges, nameChangedAt: users.nameChangedAt }).from(users).where(eq(users.id, userId)).limit(1),
    getSetting(executor, 'identity.free_name_changes', NAME_RULES.freeNameChanges),
    actionCost(executor, NAME_CHANGE_ACTION),
    getSetting(executor, 'identity.name_change_cooldown_days', NAME_RULES.cooldownDays),
    getSetting(executor, 'identity.previous_name_days', NAME_RULES.showPreviousDays),
  ]);
  const freeLeft = Math.max(0, free - (user?.nameChanges ?? 0));
  const next = nextNameChangeAt(user?.nameChangedAt ?? null, cooldownDays);
  return { freeLeft, cost: freeLeft > 0 ? 0 : price, allowedFrom: next && next.getTime() > now.getTime() ? next : null, cooldownDays, showPreviousDays };
}

/**
 * The name a member had before, while it is still shown on their public
 * profile, or null. Visitors can then tell when someone they knew under one
 * name now trades under another.
 */
export async function recentPreviousName(
  executor: Executor,
  user: { previousDisplayName: string | null; nameChangedAt: Date | null },
  now = new Date(),
): Promise<{ name: string; changedAt: Date } | null> {
  if (!user.previousDisplayName || !user.nameChangedAt) return null;
  const days = await getSetting(executor, 'identity.previous_name_days', NAME_RULES.showPreviousDays);
  return now.getTime() - user.nameChangedAt.getTime() < days * DAY_MS ? { name: user.previousDisplayName, changedAt: user.nameChangedAt } : null;
}

/**
 * Changes the display name. The first change is free (NAME_RULES); each one
 * after is charged the `identity.change_name` price in the same transaction,
 * so a member never pays for a name they did not get, nor gets one without
 * paying. The YAY ID, reputation and history stay; the audit record keeps the
 * old and the new name, so a rename never sheds what came before.
 *
 * Changes are spaced by a cooldown (NAME_RULES.cooldownDays) whether they are
 * paid or not, checked before any charge, and the previous name is kept so
 * the public profile can show it for a while.
 *
 * The charge's idempotency key is the change's number for this member: a
 * retried submit of the same change is charged once, and the next change
 * gets a new key.
 */
export async function changeDisplayName(
  tx: Executor,
  params: { userId: string; name: string; now?: Date; audit?: { ipHash?: string | null; userAgentHash?: string | null } },
): Promise<{ displayName: string; cost: number }> {
  const now = params.now ?? new Date();
  const parsed = registrationSchema.shape.displayName.safeParse(params.name);
  if (!parsed.success) throw errors.validation('settings.name.invalid');
  const name = normalizeDisplayName(parsed.data);

  // The row is locked so two submits at once count as two changes, never one charge for both.
  const [user] = await tx
    .select({ displayName: users.displayName, nameChanges: users.nameChanges, nameChangedAt: users.nameChangedAt })
    .from(users)
    .where(eq(users.id, params.userId))
    .for('update')
    .limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.displayName === name) throw errors.validation('settings.name.same');

  // Checked before any charge: a change refused for being too soon costs nothing.
  const cooldownDays = await getSetting(tx, 'identity.name_change_cooldown_days', NAME_RULES.cooldownDays);
  const next = nextNameChangeAt(user.nameChangedAt, cooldownDays);
  if (next && next.getTime() > now.getTime()) throw errors.conflict('settings.name.too_soon', { date: next.toISOString() });

  const free = await getSetting(tx, 'identity.free_name_changes', NAME_RULES.freeNameChanges);
  const number = user.nameChanges + 1;
  let cost = 0;
  if (user.nameChanges >= free) {
    const charge = await chargeForAction(tx, {
      userId: params.userId,
      actionKey: NAME_CHANGE_ACTION,
      idempotencyKey: `identity.name:${params.userId}:${number}`,
      relatedType: 'user',
      relatedId: params.userId,
    });
    cost = charge.cost;
  }

  await tx
    .update(users)
    .set({ displayName: name, nameChanges: number, nameChangedAt: now, previousDisplayName: user.displayName, updatedAt: now })
    .where(eq(users.id, params.userId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'identity.display_name_changed',
    subjectType: 'user',
    subjectId: params.userId,
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { from: user.displayName, to: name, change: number, cost },
  });
  return { displayName: name, cost };
}
