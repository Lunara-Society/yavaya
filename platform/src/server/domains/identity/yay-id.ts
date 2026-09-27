import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { yayIdRegistry } from '@/server/db/schema';
import { IDENTITY_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';

/**
 * YAY ID allocation.
 *
 * Every registered user gets a permanent 8-digit public identifier, printed as
 * `YAY-23678365`. It cannot be changed or transferred, and it is never
 * re-issued: `yay_id_registry` keeps every identifier ever allocated, including
 * those belonging to removed accounts.
 *
 * Identifiers are random rather than sequential so they leak neither the
 * platform's size nor a user's join order.
 */

export function formatYayId(digits: string): string {
  return `${IDENTITY_RULES.yayIdPrefix}-${digits}`;
}

/** Parses `YAY-23678365` or `23678365` into the stored 8-digit form. */
export function parseYayId(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  const withoutPrefix = trimmed.startsWith(`${IDENTITY_RULES.yayIdPrefix}-`)
    ? trimmed.slice(IDENTITY_RULES.yayIdPrefix.length + 1)
    : trimmed;
  return isValidYayId(withoutPrefix) ? withoutPrefix : null;
}

export function isValidYayId(digits: string): boolean {
  if (digits.length !== IDENTITY_RULES.yayIdDigits) return false;
  if (!/^\d+$/.test(digits)) return false;
  const value = Number(digits);
  return value >= IDENTITY_RULES.yayIdMinimum && value <= IDENTITY_RULES.yayIdMaximum;
}

export function randomYayIdDigits(): string {
  // Inclusive upper bound; randomInt's max is exclusive.
  return String(randomInt(IDENTITY_RULES.yayIdMinimum, IDENTITY_RULES.yayIdMaximum + 1));
}

/**
 * Reserves a fresh YAY ID inside the caller's transaction.
 *
 * The registry's primary key is what guarantees uniqueness — the retry loop is
 * only there to handle the (rare) random collision, and gives up rather than
 * spinning if the space is somehow exhausted.
 */
export async function allocateYayId(tx: Executor, userId?: string): Promise<string> {
  for (let attempt = 0; attempt < IDENTITY_RULES.yayIdAllocationAttempts; attempt += 1) {
    const candidate = randomYayIdDigits();
    const inserted = await tx
      .insert(yayIdRegistry)
      .values({ yayId: candidate, userId: userId ?? null })
      .onConflictDoNothing({ target: yayIdRegistry.yayId })
      .returning({ yayId: yayIdRegistry.yayId });

    if (inserted[0]) return inserted[0].yayId;
  }
  throw errors.internal('could not allocate a unique YAY ID');
}

/** Links a previously reserved identifier to its owner. */
export async function attachYayIdOwner(tx: Executor, yayId: string, userId: string): Promise<void> {
  await tx.update(yayIdRegistry).set({ userId }).where(eq(yayIdRegistry.yayId, yayId));
}
