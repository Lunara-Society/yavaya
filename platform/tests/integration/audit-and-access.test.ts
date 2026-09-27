import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, reputationScores, users } from '@/server/db/schema';
import { recordAudit, verifyAuditChain } from '@/server/domains/audit/service';
import { grantRole, hasPermission, listPermissions, requirePermission, revokeRole } from '@/server/domains/access/authorize';
import { applyRule, getScore } from '@/server/domains/reputation/service';
import { register } from '@/server/domains/identity/service';
import { adminGrantTokens } from '@/server/domains/tokens/service';
import { resetTransactionalData } from '../helpers/database';
import { expectAppendOnlyRefusal, expectConstraintRefusal } from '../helpers/errors';

const context = {
  networkHash: null,
  addressHash: 'audit-test',
  deviceFingerprint: null,
  userAgent: 'vitest',
};

async function createUser(): Promise<string> {
  const result = await register(
    db(),
    {
      email: `audit-user-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Audit Tester',
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  return result.userId;
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('audit log', () => {
  it('records account creation automatically', async () => {
    const userId = await createUser();
    const events = await db()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'identity.account_created'));

    expect(events.length).toBe(1);
    expect(events[0]?.subjectId).toBe(userId);
    // No secret material is ever written into an audit record.
    expect(JSON.stringify(events[0]?.metadata)).not.toContain('passphrase');
  });

  it('builds a verifiable chain', async () => {
    await createUser();
    await createUser();

    const result = await verifyAuditChain(db());
    expect(result.valid).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(2);
  });

  it('rejects updates and deletes at the database level', async () => {
    await createUser();

    await expectAppendOnlyRefusal(
      db().execute(sql`update audit_events set action = 'tampered' where id = (select min(id) from audit_events)`),
    );

    await expectAppendOnlyRefusal(
      db().execute(sql`delete from audit_events where id = (select min(id) from audit_events)`),
    );
  });

  it('detects tampering if a record is altered out of band', async () => {
    await createUser();

    // Disable the guard the way a compromised superuser would, alter a record,
    // then confirm the hash chain still catches it.
    await db().execute(sql`alter table audit_events disable trigger audit_events_append_only`);
    await db().execute(
      sql`update audit_events set action = 'identity.account_created_tampered' where id = (select min(id) from audit_events)`,
    );
    await db().execute(sql`alter table audit_events enable trigger audit_events_append_only`);

    const result = await verifyAuditChain(db());
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('hash_mismatch');
    }
  });

  it('links administrative token movements to their audit record', async () => {
    const adminId = await createUser();
    const memberId = await createUser();

    await db().transaction((tx) =>
      adminGrantTokens(tx, {
        adminUserId: adminId,
        targetUserId: memberId,
        amount: 5,
        note: 'audited grant',
        idempotencyKey: 'audited:grant',
      }),
    );

    const [event] = await db()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'tokens.admin_grant'));

    expect(event?.actorUserId).toBe(adminId);
    expect(event?.subjectId).toBe(memberId);
    expect(event?.metadata).toMatchObject({ amount: 5, note: 'audited grant' });
    expect((await verifyAuditChain(db())).valid).toBe(true);
  });
});

describe('authorization', () => {
  it('grants no administrative permission to an ordinary member', async () => {
    const userId = await createUser();
    const permissions = await listPermissions(db(), userId);
    expect(permissions.size).toBe(0);
    expect(await hasPermission(db(), userId, 'tokens.grant')).toBe(false);
  });

  it('is never derived from an email address', async () => {
    // Registering with the configured administrator address must not, by
    // itself, confer any authority. The role is granted by the backend
    // bootstrap, not inferred from what someone typed into a form.
    const result = await register(
      db(),
      {
        email: 'yavayago@gmail.com',
        password: 'a-sufficiently-long-passphrase',
        displayName: 'Admin Applicant',
        locale: 'es',
        acceptedTerms: true,
      },
      context,
    );

    expect(await hasPermission(db(), result.userId, 'users.ban')).toBe(false);
    expect(await hasPermission(db(), result.userId, 'tokens.grant')).toBe(false);
  });

  it('honours a granted role and a revoked one', async () => {
    const userId = await createUser();
    await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'moderator', grantedBy: null }));

    expect(await hasPermission(db(), userId, 'moderation.queue.read')).toBe(true);
    expect(await hasPermission(db(), userId, 'tokens.grant')).toBe(false);

    await db().transaction((tx) => revokeRole(tx, { userId, roleKey: 'moderator' }));
    expect(await hasPermission(db(), userId, 'moderation.queue.read')).toBe(false);
  });

  it('refuses a suspended administrator', async () => {
    const userId = await createUser();
    await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));

    await expect(
      requirePermission(db(), { userId, status: 'active' }, 'users.ban'),
    ).resolves.toMatchObject({ userId });

    await expect(
      requirePermission(db(), { userId, status: 'suspended' }, 'users.ban'),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses an anonymous caller', async () => {
    await expect(requirePermission(db(), null, 'users.read')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});

describe('reputation', () => {
  it('applies a configured rule once per event', async () => {
    const userId = await createUser();
    expect(await getScore(db(), userId)).toBe(50);

    const applied = await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'phone_verified',
        source: 'verification',
        idempotencyKey: `phone:${userId}`,
      }),
    );
    expect(applied).toMatchObject({ applied: true, delta: 5, score: 55 });

    const replay = await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'phone_verified',
        source: 'verification',
        idempotencyKey: `phone:${userId}`,
      }),
    );
    expect(replay).toMatchObject({ applied: false, reason: 'duplicate' });
    expect(await getScore(db(), userId)).toBe(55);
  });

  it('enforces the daily cap on repeatable rules', async () => {
    const userId = await createUser();

    // successful_transaction is capped at 20 per rolling day.
    for (let i = 0; i < 20; i += 1) {
      await db().transaction((tx) =>
        applyRule(tx, {
          userId,
          ruleKey: 'successful_transaction',
          source: 'transaction',
          idempotencyKey: `txn:${userId}:${i}`,
        }),
      );
    }

    const capped = await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'successful_transaction',
        source: 'transaction',
        idempotencyKey: `txn:${userId}:overflow`,
      }),
    );
    expect(capped.reason).toBe('daily_cap');
  });

  it('clamps at the bounds and records the delta actually applied', async () => {
    const userId = await createUser();
    await db().update(reputationScores).set({ score: 98 }).where(eq(reputationScores.userId, userId));

    const result = await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'identity_verified',
        source: 'verification',
        idempotencyKey: `identity:${userId}`,
      }),
    );

    // Configured delta is +10, but the score cannot exceed 100.
    expect(result.score).toBe(100);
    expect(result.delta).toBe(2);
  });

  it('applies penalties', async () => {
    const userId = await createUser();
    const result = await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'confirmed_fraudulent_listing',
        source: 'moderation',
        idempotencyKey: `fraud:${userId}`,
      }),
    );
    expect(result.score).toBe(25);
  });

  it('rejects any attempt to rewrite the reputation event stream', async () => {
    const userId = await createUser();
    await db().transaction((tx) =>
      applyRule(tx, {
        userId,
        ruleKey: 'email_verified',
        source: 'verification',
        idempotencyKey: `email:${userId}`,
      }),
    );

    await expectAppendOnlyRefusal(
      db().execute(sql`update reputation_events set delta = 50 where user_id = ${userId}`),
    );
  });
});

describe('audit metadata hygiene', () => {
  it('never stores a raw IP address or user agent', async () => {
    const userId = await createUser();
    await db().transaction((tx) =>
      recordAudit(tx, {
        actorType: 'user',
        actorUserId: userId,
        action: 'test.event',
        subjectType: 'user',
        subjectId: userId,
        ipHash: 'hashed-value',
        userAgentHash: 'hashed-ua',
      }),
    );

    const [event] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'test.event'));
    expect(event?.ipHash).toBe('hashed-value');
    // The column names make the contract explicit; there is nowhere to put a
    // raw address even by accident.
    expect(Object.keys(event ?? {})).not.toContain('ipAddress');
  });

  it('keeps the chain valid across many appends', async () => {
    const userId = await createUser();
    for (let i = 0; i < 25; i += 1) {
      await db().transaction((tx) =>
        recordAudit(tx, {
          actorType: 'system',
          action: 'test.bulk',
          subjectType: 'user',
          subjectId: userId,
          metadata: { index: i },
        }),
      );
    }

    const result = await verifyAuditChain(db());
    expect(result.valid).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(26);
  });
});

describe('database-level guards', () => {
  it('keeps a token account from going negative even by direct write', async () => {
    await expectConstraintRefusal(
      db().execute(sql`update token_accounts set balance = -1 where handle = 'treasury:primary'`),
    );
  });

  it('keeps a reputation score inside its range even by direct write', async () => {
    const userId = await createUser();
    await expectConstraintRefusal(
      db().execute(sql`update reputation_scores set score = 250 where user_id = ${userId}`),
    );
  });

  it('keeps every user unique by address', async () => {
    const userId = await createUser();
    const [user] = await db().select().from(users).where(eq(users.id, userId));
    await expectConstraintRefusal(
      db().execute(
        sql`insert into users (yay_id, email, email_normalized, password_hash, display_name, monitored_until)
            values ('99999999', ${user?.email}, 'x', 'x', 'x', now())`,
      ),
    );
  });
});
