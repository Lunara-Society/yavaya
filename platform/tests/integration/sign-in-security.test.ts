import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, passwordResets, sessions, twoStepFactors } from '@/server/db/schema';
import { authenticate, register } from '@/server/domains/identity/service';
import {
  base32Decode,
  base32Encode,
  codeAt,
  disableTwoStep,
  enableTwoStep,
  isTwoStepEnabled,
  newSecret,
  stepAt,
  verifySecondStep,
} from '@/server/domains/identity/two-step';
import { changePassword, requestPasswordReset, resetLinkUsable, resetPassword } from '@/server/domains/identity/password';
import { createSession, validateSession } from '@/server/auth/session';
import { TWO_STEP_RULES } from '@/config/business-rules';
import { RATE_LIMITS } from '@/server/security/rate-limit';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'security-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member(): Promise<{ userId: string; email: string }> {
  const email = `m-${crypto.randomUUID()}@example.com`;
  const created = await register(db(), { email, password: 'a-sufficiently-long-passphrase', displayName: 'Rosa', locale: 'es', acceptedTerms: true }, context);
  return { userId: created.userId, email };
}

const step = TWO_STEP_RULES.periodSeconds * 1000;

beforeEach(resetTransactionalData);
afterAll(closeDb);

describe('Two-step codes: the algorithm', () => {
  it('matches the RFC 6238 test vectors (SHA-1, last six digits)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codeAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(codeAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(codeAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('round-trips base32 and makes 160-bit secrets', () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });
});

describe('Two-step sign-in', () => {
  it('turns on only with a code from the app, and spends that code', async () => {
    const { userId } = await member();
    const secret = newSecret();
    const now = Date.now();
    const wrongCode = codeAt(secret, stepAt(now)) === '000000' ? '111111' : '000000';
    expect(await db().transaction((tx) => enableTwoStep(tx, { userId, secret, code: wrongCode, now }))).toEqual({ ok: false });

    const code = codeAt(secret, stepAt(now));
    const on = await db().transaction((tx) => enableTwoStep(tx, { userId, secret, code, now }));
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect(on.recoveryCodes).toHaveLength(TWO_STEP_RULES.recoveryCodeCount);
    expect(on.recoveryCodes[0]).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(await isTwoStepEnabled(db(), userId)).toBe(true);

    // The secret is not stored readable.
    const [row] = await db().select().from(twoStepFactors).where(eq(twoStepFactors.userId, userId));
    expect(row?.secretSealed).not.toContain(secret);

    // The code used to turn it on cannot also sign anyone in.
    const replay = await db().transaction((tx) => verifySecondStep(tx, { userId, input: code, now }));
    expect(replay).toEqual({ ok: false, reason: 'mismatch' });
    // The next window's code works, once.
    const next = codeAt(secret, stepAt(now) + 1);
    expect(await db().transaction((tx) => verifySecondStep(tx, { userId, input: next, now: now + step }))).toEqual({ ok: true, via: 'app' });
    expect(await db().transaction((tx) => verifySecondStep(tx, { userId, input: next, now: now + step }))).toEqual({ ok: false, reason: 'mismatch' });
    // A code from the window before is late but still fine; two windows out is not.
    expect((await db().transaction((tx) => verifySecondStep(tx, { userId, input: codeAt(secret, stepAt(now) + 5), now: now + 3 * step }))).ok).toBe(false);
    expect((await db().transaction((tx) => verifySecondStep(tx, { userId, input: codeAt(secret, stepAt(now) + 3), now: now + 4 * step }))).ok).toBe(true);
  });

  it('accepts each backup code once, records it, and caps guessing', async () => {
    const { userId } = await member();
    const secret = newSecret();
    const now = Date.now();
    const on = await db().transaction((tx) => enableTwoStep(tx, { userId, secret, code: codeAt(secret, stepAt(now)), now }));
    if (!on.ok) throw new Error('two-step did not turn on');
    const backup = on.recoveryCodes[3] as string;

    expect(await db().transaction((tx) => verifySecondStep(tx, { userId, input: backup.toUpperCase().replace('-', ' ') }))).toEqual({ ok: true, via: 'recovery' });
    expect(await db().transaction((tx) => verifySecondStep(tx, { userId, input: backup }))).toEqual({ ok: false, reason: 'mismatch' });
    const used = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'identity.two_step_recovery_used'), eq(auditEvents.subjectId, userId)));
    expect(used).toHaveLength(1);

    const results = [];
    for (let i = 0; i < RATE_LIMITS.twoStep.limit; i++) {
      results.push(await db().transaction((tx) => verifySecondStep(tx, { userId, input: '123456' })));
    }
    expect(results.at(-1)).toEqual({ ok: false, reason: 'rate_limited' });
    // Even the right code waits out the limit.
    expect(await db().transaction((tx) => verifySecondStep(tx, { userId, input: codeAt(secret, stepAt(Date.now())) }))).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('can be turned off, by the member or an operator, and says who', async () => {
    const { userId } = await member();
    const secret = newSecret();
    const now = Date.now();
    await db().transaction((tx) => enableTwoStep(tx, { userId, secret, code: codeAt(secret, stepAt(now)), now }));
    expect(await db().transaction((tx) => disableTwoStep(tx, { userId, actorUserId: userId, by: 'operator', reason: 'lost phone, identity checked by call' }))).toBe(true);
    expect(await isTwoStepEnabled(db(), userId)).toBe(false);
    const [event] = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'identity.two_step_disabled'), eq(auditEvents.subjectId, userId)));
    expect(event?.metadata).toMatchObject({ by: 'operator', reason: 'lost phone, identity checked by call' });
  });
});

describe('Forgotten and changed passwords', () => {
  it('issues one live link, which sets a new password once and signs out every device', async () => {
    const { userId, email } = await member();
    const session = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'vitest' }));

    expect(await requestPasswordReset(db(), { email: 'nobody@example.com', context })).toBeNull();
    const first = await requestPasswordReset(db(), { email: email.toUpperCase(), context });
    const second = await requestPasswordReset(db(), { email, context });
    if (!first || !second) throw new Error('no reset issued');
    // Asking again voids the earlier link.
    expect(await resetLinkUsable(db(), first.token)).toBe(false);
    expect(await resetLinkUsable(db(), second.token)).toBe(true);
    const stored = await db().select({ hash: passwordResets.tokenHash }).from(passwordResets).where(eq(passwordResets.userId, userId));
    expect(stored.map((row) => row.hash)).not.toContain(second.token);

    const done = await db().transaction((tx) => resetPassword(tx, { token: second.token, password: 'a-brand-new-long-passphrase' }));
    expect(done.ok).toBe(true);
    expect(await db().transaction((tx) => resetPassword(tx, { token: second.token, password: 'someone-elses-passphrase' }))).toEqual({ ok: false });
    expect(await validateSession(db(), session.token)).toBeNull();
    expect((await authenticate(db(), { email, password: 'a-brand-new-long-passphrase' }, context)).ok).toBe(true);
    expect((await authenticate(db(), { email, password: 'a-sufficiently-long-passphrase' }, context)).ok).toBe(false);
  });

  it('refuses an expired link', async () => {
    const { email } = await member();
    const issued = await requestPasswordReset(db(), { email, context, now: new Date(Date.now() - 31 * 60_000) });
    if (!issued) throw new Error('no reset issued');
    expect(await db().transaction((tx) => resetPassword(tx, { token: issued.token, password: 'a-brand-new-long-passphrase' }))).toEqual({ ok: false });
  });

  it('caps how often a mailbox can be sent links', async () => {
    const { email } = await member();
    const other = { ...context, addressHash: `net-${crypto.randomUUID()}` };
    await requestPasswordReset(db(), { email, context: other });
    await requestPasswordReset(db(), { email, context: other });
    await requestPasswordReset(db(), { email, context: other });
    await expect(requestPasswordReset(db(), { email, context: other })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('changes a password only with the current one, keeping this device signed in', async () => {
    const { userId } = await member();
    const here = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'here' }));
    const there = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'there' }));
    expect(await db().transaction((tx) => changePassword(tx, { userId, current: 'wrong-passphrase-entirely', next: 'another-long-passphrase', keepSessionId: here.sessionId }))).toEqual({ ok: false });
    const changed = await db().transaction((tx) => changePassword(tx, { userId, current: 'a-sufficiently-long-passphrase', next: 'another-long-passphrase', keepSessionId: here.sessionId }));
    expect(changed.ok).toBe(true);
    expect(await validateSession(db(), here.token)).not.toBeNull();
    expect(await validateSession(db(), there.token)).toBeNull();
    const live = await db().select().from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    expect(live).toHaveLength(1);
  });
});

describe('Where you are signed in', () => {
  it('lists live sessions only, newest activity first', async () => {
    const { activeSessions } = await import('@/server/auth/session');
    const { userId } = await member();
    const older = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' }));
    const newer = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15E148 Safari/604.1' }));
    await db().update(sessions).set({ lastUsedAt: new Date(Date.now() - 60_000) }).where(eq(sessions.id, older.sessionId));
    const gone = await db().transaction((tx) => createSession(tx, { userId, ipHash: null, userAgent: 'old' }));
    await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, gone.sessionId));
    const listed = await activeSessions(db(), userId);
    expect(listed.map((row) => row.id)).toEqual([newer.sessionId, older.sessionId]);
  });
});

describe('Account sanctions', () => {
  it('lets a moderator suspend, only an admin reinstate or ban, and records why', async () => {
    const { grantRole } = await import('@/server/domains/access/authorize');
    const { suspendMember, banMember, reinstateMember, lookUpMember } = await import('@/server/domains/access/sanctions');
    const { enforcementRecords, users } = await import('@/server/db/schema');
    const mod = await member();
    const admin = await member();
    const target = await member();
    await db().transaction(async (tx) => {
      await grantRole(tx, { userId: mod.userId, roleKey: 'moderator', grantedBy: null });
      await grantRole(tx, { userId: admin.userId, roleKey: 'admin', grantedBy: null });
    });
    const asMod = { userId: mod.userId, status: 'active' };
    const asAdmin = { userId: admin.userId, status: 'active' };
    const there = await db().transaction((tx) => createSession(tx, { userId: target.userId, ipHash: null, userAgent: 'x' }));

    await expect(db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'scam', note: '', days: null }))).rejects.toMatchObject({ messageKey: 'sanctions.error.note' });
    await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'scam', note: 'Sold a phone that never existed; three reports.', days: null }));
    expect(await validateSession(db(), there.token)).toBeNull();
    expect((await authenticate(db(), { email: target.email, password: 'a-sufficiently-long-passphrase' }, context)).ok).toBe(false);
    const found = await lookUpMember(db(), asMod, target.email);
    expect(found?.status).toBe('suspended');
    expect(found?.history[0]).toMatchObject({ type: 'suspension', reason: 'scam' });

    // A moderator cannot lift it, nor ban, nor act on a colleague or on themselves.
    await expect(db().transaction((tx) => reinstateMember(tx, { actor: asMod, userId: target.userId, note: 'my mistake' }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(db().transaction((tx) => banMember(tx, { actor: asMod, userId: target.userId, reason: 'scam', note: 'repeat offender' }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: admin.userId, reason: 'other', note: 'testing a colleague', days: 7 }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: mod.userId, reason: 'other', note: 'testing myself', days: 7 }))).rejects.toMatchObject({ messageKey: 'sanctions.error.self' });

    await db().transaction((tx) => reinstateMember(tx, { actor: asAdmin, userId: target.userId, note: 'Buyer confirmed the phone arrived.' }));
    const [after] = await db().select({ status: users.status }).from(users).where(eq(users.id, target.userId));
    expect(after?.status).toBe('pending_verification');
    const records = await db().select().from(enforcementRecords).where(eq(enforcementRecords.userId, target.userId));
    expect(records.every((record) => record.revokedAt !== null)).toBe(true);
    const actions = (await db().select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.subjectId, target.userId))).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['identity.member_suspended', 'identity.member_reinstated']));
  });
});

describe('Suspension policy (SANCTION_RULES)', () => {
  async function staff() {
    const { grantRole } = await import('@/server/domains/access/authorize');
    const mod = await member();
    const admin = await member();
    await db().transaction(async (tx) => {
      await grantRole(tx, { userId: mod.userId, roleKey: 'moderator', grantedBy: null });
      await grantRole(tx, { userId: admin.userId, roleKey: 'admin', grantedBy: null });
    });
    return { asMod: { userId: mod.userId, status: 'active' }, asAdmin: { userId: admin.userId, status: 'active' } };
  }
  const day = 24 * 60 * 60 * 1000;

  it('takes only the allowed lengths, and the clock lifts a timed suspension when it runs out', async () => {
    const { suspendMember, liftExpiredSuspensions } = await import('@/server/domains/access/sanctions');
    const { enforcementRecords, users } = await import('@/server/db/schema');
    const { asMod } = await staff();
    const target = await member();
    const now = new Date();

    await expect(db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'spam', note: 'Posted the same ad forty times.', days: 3 }))).rejects.toMatchObject({
      messageKey: 'sanctions.error.duration',
    });
    const notice = await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'spam', note: 'Posted the same ad forty times.', days: 7, now }));
    expect(notice).toMatchObject({ kind: 'suspended', reason: 'spam', email: target.email });
    expect(notice.until?.getTime()).toBe(now.getTime() + 7 * day);
    expect(notice.appealToken).toBeTruthy();

    // Not yet: six days in, nothing moves.
    expect(await liftExpiredSuspensions(db(), new Date(now.getTime() + 6 * day))).toEqual([]);
    const lifted = await liftExpiredSuspensions(db(), new Date(now.getTime() + 7 * day + 1000));
    expect(lifted).toEqual([{ email: target.email, locale: 'es', kind: 'reinstated' }]);
    const [after] = await db().select({ status: users.status }).from(users).where(eq(users.id, target.userId));
    expect(after?.status).toBe('pending_verification');
    const [record] = await db().select().from(enforcementRecords).where(eq(enforcementRecords.userId, target.userId));
    expect(record?.revokedAt).not.toBeNull();
    const [expired] = await db().select().from(auditEvents).where(and(eq(auditEvents.subjectId, target.userId), eq(auditEvents.action, 'identity.suspension_expired')));
    expect(expired?.actorType).toBe('system');
    // And only once.
    expect(await liftExpiredSuspensions(db(), new Date(now.getTime() + 8 * day))).toEqual([]);
  });

  it('never lets the clock undo a ban, and never lifts "until review"', async () => {
    const { suspendMember, banMember, liftExpiredSuspensions } = await import('@/server/domains/access/sanctions');
    const { users } = await import('@/server/db/schema');
    const { asMod, asAdmin } = await staff();
    const banned = await member();
    const held = await member();
    const now = new Date();
    await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: banned.userId, reason: 'scam', note: 'Took a deposit, sent nothing.', days: 1, now }));
    await db().transaction((tx) => banMember(tx, { actor: asAdmin, userId: banned.userId, reason: 'scam', note: 'Four more victims came forward.' }));
    await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: held.userId, reason: 'fraud', note: 'Checking the bank transfer claims.', days: null, now }));

    expect(await liftExpiredSuspensions(db(), new Date(now.getTime() + 365 * day))).toEqual([]);
    const statuses = await db().select({ id: users.id, status: users.status }).from(users);
    expect(statuses.find((row) => row.id === banned.userId)?.status).toBe('banned');
    expect(statuses.find((row) => row.id === held.userId)?.status).toBe('suspended');
  });

  it('takes one appeal from the emailed link, and an admin keeps the sanction with an answer', async () => {
    const { suspendMember, readAppealLink, submitAppeal, openAppeals, decideAppeal } = await import('@/server/domains/access/sanctions');
    const { users } = await import('@/server/db/schema');
    const { asMod, asAdmin } = await staff();
    const target = await member();
    const network = `appeal-${crypto.randomUUID()}`;
    const { appealToken } = await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'harassment', note: 'Insults in three threads.', days: 30 }));
    const token = appealToken!;

    const link = await readAppealLink(db(), token);
    expect(link).toMatchObject({ userId: target.userId, type: 'suspension', reason: 'harassment', lifted: false, appealedAt: null });
    // A link re-pointed at someone else's sanction, or forged outright, is nothing.
    const [, signature] = token.split('.');
    const repointed = Buffer.from(JSON.stringify({ r: link!.recordId, u: asMod.userId, exp: Math.floor(Date.now() / 1000) + 3600 }), 'utf8').toString('base64url');
    expect(await readAppealLink(db(), `${repointed}.${signature}`)).toBeNull();
    await expect(db().transaction((tx) => submitAppeal(tx, { token: 'forged.value', body: 'x'.repeat(40), networkHash: network }))).rejects.toMatchObject({ messageKey: 'appeal.error.link' });
    await expect(db().transaction((tx) => submitAppeal(tx, { token, body: 'too short', networkHash: network }))).rejects.toMatchObject({ messageKey: 'appeal.error.length' });

    const body = 'Those messages were from my brother on my phone. I have changed my password.';
    expect(await db().transaction((tx) => submitAppeal(tx, { token, body, networkHash: network }))).toBe('sent');
    expect(await db().transaction((tx) => submitAppeal(tx, { token, body: `${body} Again.`, networkHash: network }))).toBe('already');

    // Admins decide appeals; a moderator does not.
    await expect(openAppeals(db(), asMod)).rejects.toMatchObject({ code: 'forbidden' });
    const [open] = await openAppeals(db(), asAdmin);
    expect(open).toMatchObject({ userId: target.userId, body, note: 'Insults in three threads.' });
    await expect(db().transaction((tx) => decideAppeal(tx, { actor: asAdmin, appealId: open!.id, outcome: 'upheld', response: '' }))).rejects.toMatchObject({
      messageKey: 'appeal.error.response',
    });
    const notice = await db().transaction((tx) => decideAppeal(tx, { actor: asAdmin, appealId: open!.id, outcome: 'upheld', response: 'The account is yours to keep safe; the suspension stays.' }));
    expect(notice).toMatchObject({ kind: 'appeal_upheld', email: target.email, response: 'The account is yours to keep safe; the suspension stays.' });
    await expect(db().transaction((tx) => decideAppeal(tx, { actor: asAdmin, appealId: open!.id, outcome: 'lifted', response: 'Changed my mind.' }))).rejects.toMatchObject({
      messageKey: 'appeal.error.decided',
    });
    expect(await openAppeals(db(), asAdmin)).toEqual([]);
    const [after] = await db().select({ status: users.status }).from(users).where(eq(users.id, target.userId));
    expect(after?.status).toBe('suspended');
  });

  it('lifts a ban on appeal, and closes an appeal whose sanction ended first', async () => {
    const { suspendMember, banMember, submitAppeal, openAppeals, decideAppeal, liftExpiredSuspensions, readAppealLink } = await import('@/server/domains/access/sanctions');
    const { sanctionAppeals, users } = await import('@/server/db/schema');
    const { asMod, asAdmin } = await staff();
    const banned = await member();
    const timed = await member();
    const network = `appeal-${crypto.randomUUID()}`;
    const now = new Date();

    const ban = await db().transaction((tx) => banMember(tx, { actor: asAdmin, userId: banned.userId, reason: 'multi_account_abuse', note: 'Matched a banned device.' }));
    expect(await db().transaction((tx) => submitAppeal(tx, { token: ban.appealToken!, body: 'That phone was sold to me second-hand last month.', networkHash: network }))).toBe('sent');
    const [appeal] = await openAppeals(db(), asAdmin);
    const lifted = await db().transaction((tx) => decideAppeal(tx, { actor: asAdmin, appealId: appeal!.id, outcome: 'lifted', response: 'We checked the device history. Welcome back.' }));
    expect(lifted).toMatchObject({ kind: 'reinstated', response: 'We checked the device history. Welcome back.' });
    const [back] = await db().select({ status: users.status }).from(users).where(eq(users.id, banned.userId));
    expect(back?.status).toBe('pending_verification');

    const suspension = await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: timed.userId, reason: 'spam', note: 'Link spam in Comunidad.', days: 1, now }));
    expect(await db().transaction((tx) => submitAppeal(tx, { token: suspension.appealToken!, body: 'I did not know links were not allowed there.', networkHash: network }))).toBe('sent');
    await liftExpiredSuspensions(db(), new Date(now.getTime() + 2 * day));
    expect(await openAppeals(db(), asAdmin)).toEqual([]);
    const [closed] = await db().select().from(sanctionAppeals).where(eq(sanctionAppeals.userId, timed.userId));
    expect(closed).toMatchObject({ outcome: 'ended', decidedBy: null });
    expect((await readAppealLink(db(), suspension.appealToken!))?.lifted).toBe(true);
  });

  it('tells the right password on a sanctioned account apart from a wrong one', async () => {
    const { suspendMember } = await import('@/server/domains/access/sanctions');
    const { asMod } = await staff();
    const target = await member();
    await db().transaction((tx) => suspendMember(tx, { actor: asMod, userId: target.userId, reason: 'spam', note: 'Posted the same ad forty times.', days: 1 }));
    expect(await authenticate(db(), { email: target.email, password: 'a-sufficiently-long-passphrase' }, context)).toEqual({ ok: false, reason: 'account_unavailable' });
    expect(await authenticate(db(), { email: target.email, password: 'not-the-passphrase-at-all' }, context)).toEqual({ ok: false, reason: 'invalid_credentials' });
  });
});
