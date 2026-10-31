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

/** What the member's next name change costs: 0 while a free change is left. */
export async function nameChangeQuote(executor: Executor, userId: string): Promise<{ freeLeft: number; cost: number | null }> {
  const [[user], free, price] = await Promise.all([
    executor.select({ nameChanges: users.nameChanges }).from(users).where(eq(users.id, userId)).limit(1),
    getSetting(executor, 'identity.free_name_changes', NAME_RULES.freeNameChanges),
    actionCost(executor, NAME_CHANGE_ACTION),
  ]);
  const freeLeft = Math.max(0, free - (user?.nameChanges ?? 0));
  return { freeLeft, cost: freeLeft > 0 ? 0 : price };
}

/**
 * Changes the display name. The first change is free (NAME_RULES); each one
 * after is charged the `identity.change_name` price in the same transaction,
 * so a member never pays for a name they did not get, nor gets one without
 * paying. The YAY ID, reputation and history stay; the audit record keeps the
 * old and the new name, so a rename never sheds what came before.
 *
 * The charge's idempotency key is the change's number for this member: a
 * retried submit of the same change is charged once, and the next change
 * gets a new key.
 */
export async function changeDisplayName(
  tx: Executor,
  params: { userId: string; name: string; audit?: { ipHash?: string | null; userAgentHash?: string | null } },
): Promise<{ displayName: string; cost: number }> {
  const parsed = registrationSchema.shape.displayName.safeParse(params.name);
  if (!parsed.success) throw errors.validation('settings.name.invalid');
  const next = normalizeDisplayName(parsed.data);

  // The row is locked so two submits at once count as two changes, never one charge for both.
  const [user] = await tx
    .select({ displayName: users.displayName, nameChanges: users.nameChanges })
    .from(users)
    .where(eq(users.id, params.userId))
    .for('update')
    .limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.displayName === next) throw errors.validation('settings.name.same');

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

  await tx.update(users).set({ displayName: next, nameChanges: number, updatedAt: new Date() }).where(eq(users.id, params.userId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'identity.display_name_changed',
    subjectType: 'user',
    subjectId: params.userId,
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { from: user.displayName, to: next, change: number, cost },
  });
  return { displayName: next, cost };
}
