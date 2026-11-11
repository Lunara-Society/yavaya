import 'server-only';
import { randomInt } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { users, verificationChallenges, whatsappContacts } from '@/server/db/schema';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { sha256 } from '@/server/security/crypto';
import { RATE_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import { recordAudit } from '@/server/domains/audit/service';
import { applyRule } from '@/server/domains/reputation/service';
import { isPlausibleE164 } from '../normalize';
import { recordPhoneSignal } from '../risk';

/**
 * Verifying a phone number through WhatsApp, and linking that WhatsApp number
 * to the member's account.
 *
 * The usual check sends a code *to* a number and asks the member to type it
 * back; that needs an SMS provider. This is the same proof the other way
 * round: Yavaya gives the signed-in member a one-time code, and the member
 * sends it *from* their WhatsApp to Yavaya's number. A message arrives from a
 * number only if its sender controls it, so the number that delivers the code
 * is verified for the account that was given the code. Nothing is sent by
 * Yavaya, so it costs nothing and needs no provider.
 *
 * The challenge is a `verification_challenges` row of kind `phone` whose
 * target is this marker, because the number is not known until the message
 * arrives. The typed-code confirmation ignores rows with this target.
 */
export const WHATSAPP_TARGET = 'whatsapp';

/** Eight digits: a hundred million, tried at most a few times per number per hour. */
const CODE = /(?<!\d)(\d{8})(?!\d)/;

/** A fresh code for this member, replacing any earlier one. The code is returned once and only its hash is kept. */
export async function startWhatsappLink(database: Database, params: { userId: string }): Promise<{ code: string; expiresAt: Date }> {
  const rate = await consumeRateLimit(database, RATE_LIMITS.whatsappLinkStart, params.userId);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);
  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  const expiresAt = new Date(Date.now() + VERIFICATION_RULES.phoneCodeTtlMinutes * 60_000);
  await database.transaction(async (tx) => {
    await tx
      .update(verificationChallenges)
      .set({ status: 'expired' })
      .where(and(eq(verificationChallenges.userId, params.userId), eq(verificationChallenges.kind, 'phone'), eq(verificationChallenges.target, WHATSAPP_TARGET), eq(verificationChallenges.status, 'pending')));
    await tx.insert(verificationChallenges).values({ userId: params.userId, kind: 'phone', target: WHATSAPP_TARGET, codeHash: sha256(code), expiresAt, sentAt: new Date() });
  });
  return { code, expiresAt };
}

export type WhatsappLinkResult = { linked: false } | { linked: true; userId: string; phoneE164: string };

/**
 * Called for a message that arrived on Yavaya's WhatsApp. If its text carries
 * a code some member is waiting on, that member's phone becomes this number.
 * Anything else, including a wrong or expired code, is simply not a link: the
 * message stays an ordinary message and nothing is said about codes.
 *
 * Guesses are limited per sending number, so one phone cannot walk through
 * the codes other members are waiting on.
 */
export async function confirmWhatsappLink(database: Database, params: { waId: string; text: string | null }): Promise<WhatsappLinkResult> {
  const code = params.text ? CODE.exec(params.text)?.[1] : undefined;
  const phoneE164 = `+${params.waId}`;
  if (!code || !/^\d{6,15}$/.test(params.waId) || !isPlausibleE164(phoneE164)) return { linked: false };
  const rate = await consumeRateLimit(database, RATE_LIMITS.whatsappLinkAttempt, params.waId);
  if (!rate.allowed) return { linked: false };

  return database.transaction(async (tx) => {
    const [challenge] = await tx
      .select({ id: verificationChallenges.id, userId: verificationChallenges.userId })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.kind, 'phone'),
          eq(verificationChallenges.target, WHATSAPP_TARGET),
          eq(verificationChallenges.status, 'pending'),
          eq(verificationChallenges.codeHash, sha256(code)),
          gt(verificationChallenges.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .for('update');
    if (!challenge) return { linked: false as const };

    const now = new Date();
    await tx.update(verificationChallenges).set({ status: 'approved', consumedAt: now, target: phoneE164 }).where(eq(verificationChallenges.id, challenge.id));
    await tx.update(users).set({ phoneE164, phoneVerifiedAt: now, updatedAt: now }).where(eq(users.id, challenge.userId));
    // The conversation now belongs to a known member; a number that later verifies for someone else moves with it.
    await tx.update(whatsappContacts).set({ userId: challenge.userId }).where(eq(whatsappContacts.waId, params.waId));
    await recordPhoneSignal(tx, { userId: challenge.userId, phoneE164 });
    // Once per member, as with a typed code: verifying a second number is not a second achievement.
    await applyRule(tx, { userId: challenge.userId, ruleKey: 'phone_verified', source: 'verification', idempotencyKey: `identity.phone_verified:${challenge.userId}` });
    await recordAudit(tx, { actorType: 'user', actorUserId: challenge.userId, action: 'identity.phone_verified', subjectType: 'user', subjectId: challenge.userId, metadata: { via: 'whatsapp' } });
    return { linked: true as const, userId: challenge.userId, phoneE164 };
  });
}
