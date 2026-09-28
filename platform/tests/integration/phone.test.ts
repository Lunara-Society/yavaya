import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, reputationScores, users, verificationChallenges } from '@/server/db/schema';
import { REPUTATION_RULES, REPUTATION_RULE_DEFAULTS } from '@/config/business-rules';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { confirmPhoneVerification, phoneState, startPhoneVerification } from '@/server/domains/identity/phone/service';
import { canVerifyPhones, phoneVerifierAvailability } from '@/server/domains/identity/phone/verifier';
import { resetTransactionalData } from '../helpers/database';

const originalEnv = { ...process.env };
const context = { networkHash: null, addressHash: 'phone-test', deviceFingerprint: null, userAgent: 'vitest' };

function configure(overrides: Record<string, string | undefined>): void {
  process.env = { ...originalEnv, ...overrides };
  resetServerEnvCache();
}

async function member() {
  const { userId } = await register(
    db(),
    {
      email: `phone-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Vecina Teléfono',
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function account(userId: string) {
  const [row] = await db()
    .select({ phone: users.phoneE164, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row!;
}

beforeEach(async () => {
  await resetTransactionalData();
});
afterEach(() => {
  process.env = { ...originalEnv };
  resetServerEnvCache();
});
afterAll(async () => {
  await closeDb();
});

describe('with no SMS provider', () => {
  it('sends nothing and says so', async () => {
    configure({ SMS_PROVIDER: 'unconfigured' });
    expect(canVerifyPhones()).toBe(false);
    expect(phoneVerifierAvailability()).toMatchObject({ available: false, provider: 'unconfigured' });

    const userId = await member();
    const result = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(await db().select().from(verificationChallenges).where(eq(verificationChallenges.kind, 'phone'))).toHaveLength(0);
  });
});

describe('with the console verifier', () => {
  beforeEach(() => configure({ SMS_PROVIDER: 'console' }));

  it('is usable locally but never counts as delivery', () => {
    expect(phoneVerifierAvailability()).toMatchObject({ available: true, provider: 'console' });
    expect(canVerifyPhones()).toBe(false);
  });

  it('verifies the number only when the right code comes back', async () => {
    const userId = await member();
    const started = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.localCode).toMatch(/^\d{6}$/);
    expect((await phoneState(db(), userId)).pending?.target).toBe('+5215512345678');

    const wrong = started.localCode === '000000' ? '111111' : '000000';
    expect(await confirmPhoneVerification(db(), { userId, code: wrong })).toEqual({ ok: false, reason: 'mismatch' });
    expect((await account(userId)).verifiedAt).toBeNull();

    expect(await confirmPhoneVerification(db(), { userId, code: started.localCode! })).toEqual({
      ok: true,
      phoneE164: '+5215512345678',
    });
    const after = await account(userId);
    expect(after.phone).toBe('+5215512345678');
    expect(after.verifiedAt).not.toBeNull();

    const audits = await db()
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, userId), eq(auditEvents.action, 'identity.phone_verified')));
    expect(audits).toHaveLength(1);

    // The rule the reputation table defines for it, applied once.
    const [score] = await db().select({ score: reputationScores.score }).from(reputationScores).where(eq(reputationScores.userId, userId));
    const reward = REPUTATION_RULE_DEFAULTS.find((rule) => rule.key === 'phone_verified')!.delta;
    expect(score?.score).toBe(REPUTATION_RULES.initialScore + reward);

    // The code is spent.
    expect(await confirmPhoneVerification(db(), { userId, code: started.localCode! })).toEqual({ ok: false, reason: 'no_challenge' });
  });

  it('keeps one code live at a time, and makes the member wait between codes', async () => {
    const userId = await member();
    const first = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    expect(first.ok).toBe(true);
    const second = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    expect(second).toMatchObject({ ok: false, reason: 'cooldown' });

    // Past the cooldown, a new code replaces the old one.
    await db().update(verificationChallenges).set({ createdAt: new Date(Date.now() - 5 * 60_000) }).where(eq(verificationChallenges.userId, userId));
    const third = await startPhoneVerification(db(), { userId, phoneE164: '+5215587654321', locale: 'es' });
    expect(third.ok).toBe(true);
    const pending = await db()
      .select({ target: verificationChallenges.target })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.userId, userId),
          eq(verificationChallenges.kind, 'phone'),
          eq(verificationChallenges.status, 'pending'),
        ),
      );
    expect(pending).toEqual([{ target: '+5215587654321' }]);
    if (first.ok) {
      expect(await confirmPhoneVerification(db(), { userId, code: first.localCode! })).toMatchObject({ ok: false });
    }
  });

  it('keeps the verified number until a new one is confirmed', async () => {
    const userId = await member();
    const first = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    if (!first.ok) throw new Error('not started');
    await confirmPhoneVerification(db(), { userId, code: first.localCode! });

    expect(await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' })).toEqual({
      ok: false,
      reason: 'already_verified',
    });

    await db().update(verificationChallenges).set({ createdAt: new Date(Date.now() - 5 * 60_000) }).where(eq(verificationChallenges.userId, userId));
    const second = await startPhoneVerification(db(), { userId, phoneE164: '+5215587654321', locale: 'es' });
    expect(second.ok).toBe(true);
    expect((await account(userId)).phone).toBe('+5215512345678');

    // Confirming the second number moves the account to it, and does not
    // reward the member twice.
    if (!second.ok) throw new Error('not started');
    await confirmPhoneVerification(db(), { userId, code: second.localCode! });
    expect((await account(userId)).phone).toBe('+5215587654321');
    const [score] = await db().select({ score: reputationScores.score }).from(reputationScores).where(eq(reputationScores.userId, userId));
    const reward = REPUTATION_RULE_DEFAULTS.find((rule) => rule.key === 'phone_verified')!.delta;
    expect(score?.score).toBe(REPUTATION_RULES.initialScore + reward);
  });

  it('refuses an expired code', async () => {
    const userId = await member();
    const started = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    if (!started.ok) throw new Error('not started');
    await db().update(verificationChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verificationChallenges.userId, userId));
    expect(await confirmPhoneVerification(db(), { userId, code: started.localCode! })).toEqual({ ok: false, reason: 'expired' });
    expect((await account(userId)).verifiedAt).toBeNull();
  });
});

/**
 * Twilio Verify, exercised against a local server that answers the way the
 * Verify API does. The real endpoint is never called from tests.
 */
describe('with Twilio Verify', () => {
  type Captured = { path: string; auth: string | undefined; form: URLSearchParams };
  let server: import('node:http').Server;
  let port = 0;
  const captured: Captured[] = [];
  let startReply: { status: number; body: object } = { status: 201, body: { sid: 'VE1', status: 'pending' } };
  let checkReply: (code: string) => { status: number; body: object } = (code) =>
    code === '123456' ? { status: 200, body: { status: 'approved', valid: true } } : { status: 200, body: { status: 'pending', valid: false } };

  beforeAll(async () => {
    const { createServer } = await import('node:http');
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const form = new URLSearchParams(raw);
        captured.push({ path: req.url ?? '', auth: req.headers.authorization, form });
        const reply = req.url?.endsWith('/VerificationCheck') ? checkReply(form.get('Code') ?? '') : startReply;
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as import('node:net').AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    captured.length = 0;
    startReply = { status: 201, body: { sid: 'VE1', status: 'pending' } };
    configure({
      SMS_PROVIDER: 'twilio_verify',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token_test',
      TWILIO_VERIFY_SERVICE_SID: 'VA_test',
      TWILIO_VERIFY_API_URL: `http://127.0.0.1:${port}`,
    });
  });

  it('is REAL only with every credential', () => {
    expect(canVerifyPhones()).toBe(true);
    configure({ SMS_PROVIDER: 'twilio_verify', TWILIO_ACCOUNT_SID: 'AC_test' });
    expect(canVerifyPhones()).toBe(false);
    expect(phoneVerifierAvailability()).toMatchObject({ available: false });
  });

  it('asks Twilio to send and to check, and never holds the code itself', async () => {
    const userId = await member();
    const started = await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    expect(started).toMatchObject({ ok: true, provider: 'twilio_verify' });
    if (started.ok) expect(started.localCode).toBeUndefined();

    const send = captured.at(-1)!;
    expect(send.path).toBe('/v2/Services/VA_test/Verifications');
    expect(send.auth).toBe(`Basic ${Buffer.from('AC_test:token_test').toString('base64')}`);
    expect(Object.fromEntries(send.form)).toEqual({ To: '+5215512345678', Channel: 'sms', Locale: 'es' });

    const [challenge] = await db()
      .select()
      .from(verificationChallenges)
      .where(and(eq(verificationChallenges.userId, userId), eq(verificationChallenges.kind, 'phone')));
    expect(challenge?.codeHash).toBeNull();

    expect(await confirmPhoneVerification(db(), { userId, code: '999999' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(await confirmPhoneVerification(db(), { userId, code: '123456' })).toEqual({ ok: true, phoneE164: '+5215512345678' });
    const check = captured.at(-1)!;
    expect(check.path).toBe('/v2/Services/VA_test/VerificationCheck');
    expect(Object.fromEntries(check.form)).toEqual({ To: '+5215512345678', Code: '123456' });
    expect((await account(userId)).verifiedAt).not.toBeNull();
  });

  it('reports an invalid number, and stores no challenge for it', async () => {
    startReply = { status: 400, body: { code: 60200, message: 'Invalid parameter: To' } };
    const userId = await member();
    expect(await startPhoneVerification(db(), { userId, phoneE164: '+5210000000', locale: 'es' })).toEqual({
      ok: false,
      reason: 'invalid_number',
    });
    expect(await db().select().from(verificationChallenges).where(eq(verificationChallenges.kind, 'phone'))).toHaveLength(0);
  });

  it('treats a verification Twilio no longer has as expired', async () => {
    const userId = await member();
    await startPhoneVerification(db(), { userId, phoneE164: '+5215512345678', locale: 'es' });
    checkReply = () => ({ status: 404, body: { code: 20404 } });
    expect(await confirmPhoneVerification(db(), { userId, code: '123456' })).toEqual({ ok: false, reason: 'expired' });
    expect((await account(userId)).verifiedAt).toBeNull();
  });
});
