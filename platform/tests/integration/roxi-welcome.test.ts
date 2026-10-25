import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { roxiHelpDaily, sessions } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole, revokeRole } from '@/server/domains/access/authorize';
import { createSession } from '@/server/auth/session';
import { pendingWelcome, recordWelcomePlayed, welcomeAudience, welcomeRecording, welcomesPlayed } from '@/server/domains/roxi/welcome';
import { countRoxiHelp, roxiHelpTotals } from '@/server/domains/roxi/help-stats';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'roxi-welcome-test', deviceFingerprint: null, userAgent: 'vitest' };

beforeEach(resetTransactionalData);
afterAll(closeDb);

async function person(displayName: string, email = `w-${crypto.randomUUID()}@example.com`) {
  const { userId } = await register(db(), { email, password: 'a-sufficiently-long-passphrase', displayName, locale: 'es', acceptedTerms: true }, context);
  return userId;
}

async function appoint(userId: string, roleKey: string) {
  await db().transaction((tx) => grantRole(tx, { userId, roleKey, grantedBy: null }));
}

/** A login as the server sees it: the session row, with the time it was created. */
async function login(userId: string) {
  const { sessionId } = await db().transaction((tx) => createSession(tx, { userId }));
  const [row] = await db().select({ createdAt: sessions.createdAt }).from(sessions).where(eq(sessions.id, sessionId));
  return { userId, sessionId, createdAt: row!.createdAt };
}

const seconds = (base: Date, n: number) => new Date(base.getTime() + n * 1000);

describe('Roxi welcome voice notes', () => {
  it('greet the community manager named Tania on her next two logins, then never again', async () => {
    const tania = await person('Tania Ponce');
    await appoint(tania, 'community_manager');
    expect(await welcomeAudience(db(), tania)).toBe('community_manager');

    const first = await login(tania);
    // Ten seconds after signing in, not before.
    const justIn = await pendingWelcome(db(), first, seconds(first.createdAt, 1));
    expect(justIn).toMatchObject({ key: 'community_manager', variant: 1 });
    expect(justIn!.delayMs).toBe(9000);
    expect((await pendingWelcome(db(), first, seconds(first.createdAt, 30)))!.delayMs).toBe(0);

    // A reload on the same login gets the same note until it is played.
    expect((await pendingWelcome(db(), first, seconds(first.createdAt, 40)))!.variant).toBe(1);
    expect(await recordWelcomePlayed(db(), first, seconds(first.createdAt, 41))).toBe(true);
    // Reported twice (two tabs): recorded once.
    expect(await recordWelcomePlayed(db(), first, seconds(first.createdAt, 42))).toBe(false);
    expect(await pendingWelcome(db(), first, seconds(first.createdAt, 50))).toBeNull();
    // She may still listen again on that login.
    expect(await welcomeRecording(db(), first, seconds(first.createdAt, 60))).toEqual({ key: 'community_manager', variant: 1 });

    const second = await login(tania);
    expect(await pendingWelcome(db(), second, seconds(second.createdAt, 2))).toMatchObject({ key: 'community_manager', variant: 2 });
    expect(await recordWelcomePlayed(db(), second, seconds(second.createdAt, 15))).toBe(true);

    const third = await login(tania);
    expect(await pendingWelcome(db(), third, seconds(third.createdAt, 2))).toBeNull();
    expect(await welcomeRecording(db(), third, seconds(third.createdAt, 2))).toBeNull();
    expect(await recordWelcomePlayed(db(), third, seconds(third.createdAt, 15))).toBe(false);
    expect(await welcomesPlayed(db(), tania)).toBe(2);
  });

  it('greet the administrator at the primary admin address the same way', async () => {
    const owner = await person('Yavaya', 'YavayaGo@gmail.com');
    // The address alone is nobody: without the role there is no note.
    expect(await welcomeAudience(db(), owner)).toBeNull();
    await appoint(owner, 'admin');
    expect(await welcomeAudience(db(), owner)).toBe('owner');

    const first = await login(owner);
    expect(await pendingWelcome(db(), first, seconds(first.createdAt, 0))).toMatchObject({ key: 'owner', variant: 1, delayMs: 10_000 });
    await recordWelcomePlayed(db(), first, seconds(first.createdAt, 12));
    const second = await login(owner);
    expect(await pendingWelcome(db(), second, seconds(second.createdAt, 3))).toMatchObject({ key: 'owner', variant: 2 });
    await recordWelcomePlayed(db(), second, seconds(second.createdAt, 12));
    const third = await login(owner);
    expect(await pendingWelcome(db(), third, seconds(third.createdAt, 3))).toBeNull();
  });

  it('are for no one else: another community manager, another admin, a Tania without the role', async () => {
    const otherManager = await person('Rosa Méndez');
    await appoint(otherManager, 'community_manager');
    const otherAdmin = await person('Tania Admin');
    await appoint(otherAdmin, 'admin');
    const memberTania = await person('Tania Ruiz');

    for (const userId of [otherManager, otherAdmin, memberTania]) {
      const session = await login(userId);
      expect(await welcomeAudience(db(), userId)).toBeNull();
      expect(await pendingWelcome(db(), session, seconds(session.createdAt, 1))).toBeNull();
      expect(await welcomeRecording(db(), session, seconds(session.createdAt, 1))).toBeNull();
      expect(await recordWelcomePlayed(db(), session, seconds(session.createdAt, 12))).toBe(false);
    }

    // Folding: the name matches however it is written.
    const accented = await person('  TANÍA  Ponce');
    await appoint(accented, 'community_manager');
    expect(await welcomeAudience(db(), accented)).toBe('community_manager');

    // The role removed, the note goes with it.
    await db().transaction((tx) => revokeRole(tx, { userId: accented, roleKey: 'community_manager' }));
    expect(await welcomeAudience(db(), accented)).toBeNull();
  });

  it('are not offered to a login that is no longer fresh, and do not use up a play', async () => {
    const tania = await person('Tania Ponce');
    await appoint(tania, 'community_manager');
    const old = await login(tania);
    const later = seconds(old.createdAt, 16 * 60);
    expect(await pendingWelcome(db(), old, later)).toBeNull();
    expect(await welcomeRecording(db(), old, later)).toBeNull();
    expect(await recordWelcomePlayed(db(), old, later)).toBe(false);

    const fresh = await login(tania);
    expect(await pendingWelcome(db(), fresh, seconds(fresh.createdAt, 1))).toMatchObject({ variant: 1 });
  });
});

describe('Roxi help counts', () => {
  it('add up per day and event, and are the owner’s to read', async () => {
    const now = new Date();
    await countRoxiHelp(db(), 'call_rang', now);
    await countRoxiHelp(db(), 'call_rang', now);
    await countRoxiHelp(db(), 'call_answered', now);
    await countRoxiHelp(db(), 'prompted_task', now);

    const [row] = await db().select({ n: sql<number>`count(*)::int` }).from(roxiHelpDaily);
    expect(row!.n).toBe(3);

    const owner = await person('Yavaya', 'yavayago@gmail.com');
    await appoint(owner, 'admin');
    const totals = await roxiHelpTotals(db(), { userId: owner, status: 'active' }, { days: 7, now });
    expect(totals).toMatchObject({ call_rang: 2, call_answered: 1, prompted_task: 1, checkin_shown: 0 });

    const member = await person('Rosa');
    await expect(roxiHelpTotals(db(), { userId: member, status: 'active' }, { days: 7, now })).rejects.toThrow();
  });
});
