import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { twoStepFactors, twoStepRecoveryCodes } from '@/server/db/schema';
import { TWO_STEP_RULES } from '@/config/business-rules';
import { serverEnv } from '@/config/env';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { safeEqual, sha256 } from '@/server/security/crypto';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { recordAudit } from '@/server/domains/audit/service';
import { DomainError, errors } from '@/server/errors';

/**
 * Two-step sign-in with an authenticator app (TOTP, RFC 6238).
 *
 * After the password or Google, the member types the six digits their app
 * shows. Nothing is sent, so it costs nothing and cannot be intercepted on
 * the way: the code is computed on the phone from a secret the phone and
 * Yavaya share. The secret is sealed at rest under TWO_STEP_KEY; without the
 * key the feature is not offered at all.
 *
 * Recovery codes are the way back in when the phone is lost. They are shown
 * once and only their hashes are kept. Past that, an operator can turn two-
 * step off for a member (see `disableTwoStep`), which is audited.
 */

const PURPOSE = 'two-step.secret';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The key that seals new secrets (see usableKey for what counts as one). */
function key(): string | null {
  try {
    return usableKey(serverEnv().TWO_STEP_KEY);
  } catch {
    return null;
  }
}

/** The key being rotated away from: still opens old secrets until they are resealed. */
function previousKey(): string | null {
  try {
    return usableKey(serverEnv().TWO_STEP_KEY_PREVIOUS);
  } catch {
    return null;
  }
}

export function twoStepAvailable(): boolean {
  return key() !== null;
}

function requireKey(): string {
  const secret = key();
  if (!secret) throw new DomainError('integration_unconfigured', 'two_step.error.unavailable');
  return secret;
}

// --- The algorithm -----------------------------------------------------------

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends for HMAC-SHA1. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(now: number): number {
  return Math.floor(now / 1000 / TWO_STEP_RULES.periodSeconds);
}

export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TWO_STEP_RULES.digits).padStart(TWO_STEP_RULES.digits, '0');
}

/** The window a code belongs to, within the allowed drift, or null. */
export function matchingStep(secret: string, code: string, now: number): number | null {
  const current = stepAt(now);
  for (let drift = -TWO_STEP_RULES.driftSteps; drift <= TWO_STEP_RULES.driftSteps; drift++) {
    if (safeEqual(codeAt(secret, current + drift), code)) return current + drift;
  }
  return null;
}

/** What the authenticator app scans. The label is what the app lists the account as. */
export function enrolmentUri(secret: string, label: string): string {
  const issuer = encodeURIComponent(TWO_STEP_RULES.issuer);
  return (
    `otpauth://totp/${issuer}:${encodeURIComponent(label)}?secret=${secret}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${TWO_STEP_RULES.digits}&period=${TWO_STEP_RULES.periodSeconds}`
  );
}

// --- Recovery codes ----------------------------------------------------------

/** `ab3cd-7ef2g`: 50 random bits, readable aloud, no 0/1/8/9 to confuse. */
function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function recoveryHash(code: string): string {
  return sha256(`two-step-recovery:${code.toLowerCase().replace(/[^a-z2-7]/g, '')}`);
}

/** Six digits are an app code; anything with letters is a recovery code. */
export function looksLikeRecoveryCode(input: string): boolean {
  return /[a-z]/i.test(input);
}

async function issueRecoveryCodes(tx: Executor, userId: string): Promise<string[]> {
  await tx.delete(twoStepRecoveryCodes).where(eq(twoStepRecoveryCodes.userId, userId));
  const codes = Array.from({ length: TWO_STEP_RULES.recoveryCodeCount }, newRecoveryCode);
  await tx.insert(twoStepRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: recoveryHash(code) })));
  return codes;
}

// --- Reading -----------------------------------------------------------------

export async function isTwoStepEnabled(executor: Executor, userId: string): Promise<boolean> {
  const [row] = await executor.select({ userId: twoStepFactors.userId }).from(twoStepFactors).where(eq(twoStepFactors.userId, userId)).limit(1);
  return Boolean(row);
}

export async function twoStepStatus(
  executor: Executor,
  userId: string,
): Promise<{ enabled: false } | { enabled: true; enabledAt: Date; recoveryLeft: number }> {
  const [factor] = await executor.select({ enabledAt: twoStepFactors.enabledAt }).from(twoStepFactors).where(eq(twoStepFactors.userId, userId)).limit(1);
  if (!factor) return { enabled: false };
  const [left] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(twoStepRecoveryCodes)
    .where(and(eq(twoStepRecoveryCodes.userId, userId), isNull(twoStepRecoveryCodes.usedAt)));
  return { enabled: true, enabledAt: factor.enabledAt, recoveryLeft: left?.count ?? 0 };
}

// --- Changing ----------------------------------------------------------------

/**
 * Turns two-step on, once the member has proved their app holds the secret by
 * typing a code from it. Returns the recovery codes — the only time they exist
 * in readable form.
 */
export async function enableTwoStep(
  tx: Executor,
  params: { userId: string; secret: string; code: string; now?: number },
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const sealKey = requireKey();
  const now = params.now ?? Date.now();
  if (await isTwoStepEnabled(tx, params.userId)) throw errors.conflict('two_step.error.already_on');

  const step = matchingStep(params.secret, params.code.replace(/\D/g, ''), now);
  if (step === null) return { ok: false };

  await tx.insert(twoStepFactors).values({
    userId: params.userId,
    secretSealed: seal(sealKey, PURPOSE, params.secret),
    // The code just typed is spent: it cannot then sign anyone in.
    lastUsedStep: step,
    enabledAt: new Date(now),
  });
  const recoveryCodes = await issueRecoveryCodes(tx, params.userId);
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'identity.two_step_enabled',
    subjectType: 'user',
    subjectId: params.userId,
  });
  return { ok: true, recoveryCodes };
}

export type SecondStepResult = { ok: true; via: 'app' | 'recovery' } | { ok: false; reason: 'mismatch' | 'rate_limited' | 'not_enabled' };

/**
 * Checks a code from the app or a recovery code. Never throws on a wrong code:
 * the attempt must be counted, and a throw would roll the count back with the
 * transaction.
 *
 * An app code is accepted once: its window has to be later than the last one
 * used, and that is written in the same statement that checks it, so two
 * requests racing with the same code cannot both pass.
 */
export async function verifySecondStep(
  tx: Executor,
  params: { userId: string; input: string; now?: number },
): Promise<SecondStepResult> {
  const now = params.now ?? Date.now();
  const limit = await consumeRateLimit(tx, RATE_LIMITS.twoStep, params.userId);
  if (!limit.allowed) return { ok: false, reason: 'rate_limited' };

  const [factor] = await tx.select().from(twoStepFactors).where(eq(twoStepFactors.userId, params.userId)).limit(1);
  if (!factor) return { ok: false, reason: 'not_enabled' };

  if (looksLikeRecoveryCode(params.input)) {
    const used = await tx
      .update(twoStepRecoveryCodes)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(twoStepRecoveryCodes.userId, params.userId),
          eq(twoStepRecoveryCodes.codeHash, recoveryHash(params.input)),
          isNull(twoStepRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: twoStepRecoveryCodes.id });
    if (used.length === 0) return { ok: false, reason: 'mismatch' };
    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: params.userId,
      action: 'identity.two_step_recovery_used',
      subjectType: 'user',
      subjectId: params.userId,
    });
    return { ok: true, via: 'recovery' };
  }

  let secret: string;
  try {
    secret = unsealAny([requireKey(), previousKey()], PURPOSE, factor.secretSealed);
  } catch (error) {
    // A changed or missing key: no code can match. Said loudly, because every
    // member with two-step is now locked out until the key is restored.
    console.error('two-step secret could not be opened — was TWO_STEP_KEY changed without TWO_STEP_KEY_PREVIOUS?', error);
    return { ok: false, reason: 'mismatch' };
  }

  const step = matchingStep(secret, params.input.replace(/\D/g, ''), now);
  if (step === null) return { ok: false, reason: 'mismatch' };
  const claimed = await tx
    .update(twoStepFactors)
    .set({ lastUsedStep: step })
    .where(and(eq(twoStepFactors.userId, params.userId), lt(twoStepFactors.lastUsedStep, step)))
    .returning({ userId: twoStepFactors.userId });
  return claimed.length > 0 ? { ok: true, via: 'app' } : { ok: false, reason: 'mismatch' };
}

/** New recovery codes, the old ones void. The caller has already checked a code. */
export async function replaceRecoveryCodes(tx: Executor, userId: string): Promise<string[]> {
  const codes = await issueRecoveryCodes(tx, userId);
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: userId,
    action: 'identity.two_step_recovery_replaced',
    subjectType: 'user',
    subjectId: userId,
  });
  return codes;
}

/**
 * Turns two-step off. By the member, after a code; or by an operator for a
 * member who lost both phone and recovery codes — after checking who they are
 * outside Yavaya, which is why the reason is required and recorded.
 */
export async function disableTwoStep(
  tx: Executor,
  params: { userId: string; actorUserId: string; by: 'member' | 'operator'; reason?: string },
): Promise<boolean> {
  const removed = await tx.delete(twoStepFactors).where(eq(twoStepFactors.userId, params.userId)).returning({ userId: twoStepFactors.userId });
  await tx.delete(twoStepRecoveryCodes).where(eq(twoStepRecoveryCodes.userId, params.userId));
  if (removed.length === 0) return false;
  await recordAudit(tx, {
    actorType: params.by === 'operator' ? 'admin' : 'user',
    actorUserId: params.actorUserId,
    action: 'identity.two_step_disabled',
    subjectType: 'user',
    subjectId: params.userId,
    metadata: { by: params.by, ...(params.reason ? { reason: params.reason } : {}) },
  });
  return true;
}
