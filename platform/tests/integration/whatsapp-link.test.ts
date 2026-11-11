import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, rateLimitCounters, users, verificationChallenges, whatsappContacts } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { confirmPhoneVerification } from '@/server/domains/identity/phone/service';
import { confirmWhatsappLink, startWhatsappLink } from '@/server/domains/identity/phone/whatsapp-link';
import { RATE_LIMITS } from '@/server/security/rate-limit';
import { resetTransactionalData } from '../helpers/database';

/**
 * Verifying a phone by WhatsApp: the member is given a code, and the number
 * that sends it to Yavaya becomes their verified phone.
 */

const context = { networkHash: null, addressHash: 'wa-link-test', deviceFingerprint: null, userAgent: 'vitest' };

async function person() {
  const { userId } = await register(
    db(),
    { email: `link-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Marta', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const phoneOf = async (userId: string) => (await db().select({ phone: users.phoneE164, at: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)))[0]!;

beforeEach(async () => {
  await resetTransactionalData();
  await db().delete(rateLimitCounters);
});

afterAll(async () => {
  await closeDb();
});

describe('verifying a phone by WhatsApp', () => {
  it('links the number that sends the code, once, and records it', async () => {
    const userId = await person();
    await db().insert(whatsappContacts).values({ waId: '50588881234', lastMessageAt: new Date() });
    const { code } = await startWhatsappLink(db(), { userId });
    expect(code).toMatch(/^\d{8}$/);

    const result = await confirmWhatsappLink(db(), { waId: '50588881234', text: `Quiero verificar mi número en Yavaya. Mi código es ${code}` });
    expect(result).toEqual({ linked: true, userId, phoneE164: '+50588881234' });
    const after = await phoneOf(userId);
    expect(after.phone).toBe('+50588881234');
    expect(after.at).toBeInstanceOf(Date);
    const [contact] = await db().select({ userId: whatsappContacts.userId }).from(whatsappContacts).where(eq(whatsappContacts.waId, '50588881234'));
    expect(contact?.userId).toBe(userId);
    const audits = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'identity.phone_verified'), eq(auditEvents.subjectId, userId)));
    expect(audits).toHaveLength(1);

    // The code is spent: another phone sending it gets nothing.
    expect(await confirmWhatsappLink(db(), { waId: '50577770000', text: code })).toEqual({ linked: false });
    expect((await phoneOf(userId)).phone).toBe('+50588881234');
  });

  it('ignores ordinary messages, wrong codes and expired codes, and says nothing about them', async () => {
    const userId = await person();
    const { code } = await startWhatsappLink(db(), { userId });
    const wrong = code === '00000000' ? '00000001' : '00000000';
    expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: 'Hola, ¿cuánto cuesta publicar?' })).toEqual({ linked: false });
    expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: null })).toEqual({ linked: false });
    expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: wrong })).toEqual({ linked: false });
    // Nine digits are not a code, even when eight of them match.
    expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: `${code}7` })).toEqual({ linked: false });
    await db().update(verificationChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verificationChallenges.userId, userId));
    expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: code })).toEqual({ linked: false });
    expect((await phoneOf(userId)).phone).toBeNull();
  });

  it('keeps only the newest code, and a code sent by WhatsApp cannot be typed into the other form', async () => {
    const userId = await person();
    const first = await startWhatsappLink(db(), { userId });
    const second = await startWhatsappLink(db(), { userId });
    if (first.code !== second.code) expect(await confirmWhatsappLink(db(), { waId: '50588881234', text: first.code })).toEqual({ linked: false });
    expect(await confirmPhoneVerification(db(), { userId, code: second.code })).toEqual({ ok: false, reason: 'no_challenge' });
    expect((await phoneOf(userId)).phone).toBeNull();
    expect((await confirmWhatsappLink(db(), { waId: '50588881234', text: second.code })).linked).toBe(true);
  });

  it('stops one number from trying code after code', async () => {
    const userId = await person();
    const { code } = await startWhatsappLink(db(), { userId });
    for (let i = 0; i < RATE_LIMITS.whatsappLinkAttempt.limit; i += 1) {
      expect(await confirmWhatsappLink(db(), { waId: '50566660000', text: '11111111' })).toEqual({ linked: false });
    }
    // Even the right code is refused from that number now; the member's own phone still works.
    expect(await confirmWhatsappLink(db(), { waId: '50566660000', text: code })).toEqual({ linked: false });
    expect((await confirmWhatsappLink(db(), { waId: '50588881234', text: code })).linked).toBe(true);
  });
});
