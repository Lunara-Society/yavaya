import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { activityEvents, demoContent, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { appoint } from '@/server/domains/access/staff';
import { suspendMember } from '@/server/domains/access/sanctions';
import { ownerOverview } from '@/server/domains/ops/overview';
import { purgeOldActivity, recentActivity } from '@/server/domains/notifications/activity';
import { createSession } from '@/server/auth/session';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'panel-test', deviceFingerprint: null, userAgent: 'vitest' };
const DAY = 24 * 60 * 60 * 1000;

async function member(name = 'Rosa'): Promise<string> {
  const created = await register(db(), { email: `p-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true }, context);
  return created.userId;
}

beforeEach(resetTransactionalData);
afterAll(closeDb);

describe('Activity is kept a week', () => {
  it('lists the week newest first and deletes what is older', async () => {
    const now = Date.now();
    await db().insert(activityEvents).values([
      { kind: 'member_joined', occurredAt: new Date(now - 2 * DAY), visibleUntil: new Date(now - 2 * DAY + 3_600_000) },
      { kind: 'church_joined', occurredAt: new Date(now - 60_000) },
      { kind: 'animal_listed', occurredAt: new Date(now - (LIVE_FEED_RULES.keepDays + 1) * DAY) },
    ]);
    // The live messages see only what is new; the week's list sees all that is kept, newest first.
    expect((await recentActivity(db())).map((item) => item.kind)).toEqual(['church_joined']);
    expect((await recentActivity(db(), { week: true })).map((item) => item.kind)).toEqual(['church_joined', 'member_joined']);

    expect(await purgeOldActivity(db())).toBe(1);
    const left = await db().select({ kind: activityEvents.kind }).from(activityEvents);
    expect(left.map((row) => row.kind).sort()).toEqual(['church_joined', 'member_joined']);
  });
});

describe('The owner panel', () => {
  it('is for roles.manage only', async () => {
    const mod = await member();
    await db().transaction((tx) => grantRole(tx, { userId: mod, roleKey: 'moderator', grantedBy: null }));
    await expect(ownerOverview(db(), { userId: mod, status: 'active' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('shows the team with last activity, the week of team actions newest first, and real counts', async () => {
    const owner = await member('Dueña');
    const tania = await member('Tania');
    const target = await member('Pedro');
    await db().transaction((tx) => grantRole(tx, { userId: owner, roleKey: 'admin', grantedBy: null }));
    const asOwner = { userId: owner, status: 'active' };
    // Only a verified member can be appointed.
    await db().update(users).set({ status: 'active' }).where(eq(users.id, tania));
    await db().transaction((tx) => appoint(tx, { actor: asOwner, userId: tania, role: 'community_manager' }));
    await db().transaction((tx) => createSession(tx, { userId: tania, ipHash: null, userAgent: 'x' }));
    await db().transaction((tx) => suspendMember(tx, { actor: asOwner, userId: target, reason: 'spam', note: 'Repeated spam in Comunidad.' }));
    // A demo account never counts.
    const demoUser = await member('Demo');
    await db().insert(demoContent).values({ subjectType: 'user', subjectId: demoUser, expiresAt: new Date(Date.now() + DAY) });

    const overview = await ownerOverview(db(), asOwner);
    const taniaRow = overview.team.find((person) => person.id === tania);
    expect(taniaRow).toMatchObject({ displayName: 'Tania', roles: ['community_manager'], twoStep: false });
    expect(taniaRow?.lastActiveAt).toBeInstanceOf(Date);
    expect(overview.events.map((event) => event.action)).toEqual(['identity.member_suspended', 'roles.appointed']);
    expect(overview.events[1]).toMatchObject({ by: 'Dueña', who: 'Tania', role: 'community_manager' });
    expect(overview.counts.newMembers).toBe(3);
    expect(overview.counts.members).toBe(3);
    const [demoRow] = await db().select().from(demoContent).where(eq(demoContent.subjectId, demoUser));
    expect(demoRow).toBeTruthy();
  });
});
