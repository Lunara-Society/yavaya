import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, users, workEmployers } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole, hasPermission } from '@/server/domains/access/authorize';
import { appoint, removeAppointment, searchMembers, staffList } from '@/server/domains/access/staff';
import { listNotifications } from '@/server/domains/notifications/service';
import { queuesFor } from '@/server/domains/ops/queues';
import { recordJobRun, sendOpsEmails } from '@/server/domains/ops/alerts';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'staff-test', deviceFingerprint: null, userAgent: 'vitest' };
async function account(name: string, status: 'active' | 'pending_verification' = 'active') {
  const { userId } = await register(db(), { email: `st-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true }, context);
  await db().update(users).set({ status }).where(eq(users.id, userId));
  return userId;
}
const as = (userId: string) => ({ userId, status: 'active' });

describe('team and operations', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('lets an admin appoint and remove a guardian, recorded and notified', async () => {
    const admin = await account('Dueña');
    await db().transaction((tx) => grantRole(tx, { userId: admin, roleKey: 'admin', grantedBy: null }));
    const maria = await account('María Guardiana');
    const found = await searchMembers(db(), as(admin), 'María');
    expect(found.map((m) => m.id)).toContain(maria);

    await db().transaction((tx) => appoint(tx, { actor: as(admin), userId: maria, role: 'safe_space_guardian' }));
    expect(await hasPermission(db(), maria, 'safe_space.review')).toBe(true);
    expect(await hasPermission(db(), maria, 'listings.moderate')).toBe(false);
    expect((await staffList(db(), as(admin))).some((s) => s.id === maria && s.roleKey === 'safe_space_guardian')).toBe(true);
    expect((await listNotifications(db(), maria, 10)).some((n) => n.titleKey === 'notify.staff.appointed.safe_space_guardian')).toBe(true);
    const audit = await db().select().from(auditEvents).where(eq(auditEvents.action, 'roles.appointed'));
    expect(audit).toHaveLength(1);

    await db().transaction((tx) => removeAppointment(tx, { actor: as(admin), userId: maria, role: 'safe_space_guardian' }));
    expect(await hasPermission(db(), maria, 'safe_space.review')).toBe(false);
  });

  it('never appoints an admin, a non-admin never appoints, and an unconfirmed account is refused', async () => {
    const admin = await account('Dueña');
    await db().transaction((tx) => grantRole(tx, { userId: admin, roleKey: 'admin', grantedBy: null }));
    const mod = await account('Moderador');
    await db().transaction((tx) => grantRole(tx, { userId: mod, roleKey: 'moderator', grantedBy: null }));
    const target = await account('Alguien');
    await expect(db().transaction((tx) => appoint(tx, { actor: as(admin), userId: target, role: 'admin' }))).rejects.toMatchObject({ messageKey: 'staff.error.role' });
    await expect(db().transaction((tx) => appoint(tx, { actor: as(mod), userId: target, role: 'moderator' }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(searchMembers(db(), as(mod), 'Alguien')).rejects.toMatchObject({ code: 'forbidden' });
    const unconfirmed = await account('Sin confirmar', 'pending_verification');
    await expect(db().transaction((tx) => appoint(tx, { actor: as(admin), userId: unconfirmed, role: 'support' }))).rejects.toMatchObject({ messageKey: 'staff.error.not_active' });
  });

  it('shows each person only the queues they can work, with counts', async () => {
    const reviewer = await account('Revisora');
    await db().transaction((tx) => grantRole(tx, { userId: reviewer, roleKey: 'district_reviewer', grantedBy: null }));
    const employer = await account('Empresa');
    const [place] = (await db().execute(`select id from locations where level = 'city' limit 1`)) as unknown as Array<{ id: string }>;
    await db().insert(workEmployers).values({ userId: employer, kind: 'person', name: 'Juan Pérez', about: 'Contrato ayuda para mi finca de café en Matagalpa.', locationId: place!.id, whatsappE164: '+50588881111' });
    const queues = await queuesFor(db(), reviewer);
    const keys = queues.map((q) => q.key);
    expect(keys).toContain('work_employers');
    expect(keys).toContain('sanctuary_churches');
    expect(keys).not.toContain('safe_space_reports');
    expect(keys).not.toContain('mercadito_reports');
    const employers = queues.find((q) => q.key === 'work_employers')!;
    expect(employers.count).toBe(1);
    expect(employers.oldestAt).toBeInstanceOf(Date);
  });

  it('emails the team once a day, only when something waits, and tells admins about failed jobs', async () => {
    const admin = await account('Dueña');
    await db().transaction((tx) => grantRole(tx, { userId: admin, roleKey: 'admin', grantedBy: null }));
    const guardian = await account('Guardiana');
    await db().transaction((tx) => grantRole(tx, { userId: guardian, roleKey: 'safe_space_guardian', grantedBy: null }));
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const delivery = { available: () => true, send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); } };
    const at = new Date(Date.UTC(2026, 9, 2, 14, 5));

    // Nothing waiting, nothing failed: nobody is emailed.
    expect((await sendOpsEmails(db(), at, delivery)).sent).toBe(0);

    const employer = await account('Empresa');
    const [place] = (await db().execute(`select id from locations where level = 'city' limit 1`)) as unknown as Array<{ id: string }>;
    await db().insert(workEmployers).values({ userId: employer, kind: 'person', name: 'Juan Pérez', about: 'Contrato ayuda para mi finca de café en Matagalpa.', locationId: place!.id, whatsappE164: '+50588881111', updatedAt: new Date(at.getTime() - 72 * 3_600_000) });
    await recordJobRun(db(), 'send-digests', false, 'FAILED provider timeout', new Date(at.getTime() - 3_600_000));
    // Not the hour: nothing.
    expect((await sendOpsEmails(db(), new Date(Date.UTC(2026, 9, 2, 13, 5)), delivery)).skipped).toBe('not_the_hour');
    const result = await sendOpsEmails(db(), at, delivery);
    expect(result.sent).toBe(1); // the guardian has no queue with anything in it
    const [admins] = await db().select({ email: users.email }).from(users).where(eq(users.id, admin));
    expect(sent[0]!.to).toBe(admins!.email);
    expect(sent[0]!.subject).toContain('atrasad');
    expect(sent[0]!.text).toContain('Empleadores por verificar: 1');
    expect(sent[0]!.text).toContain('send-digests');
    // Recorded as sent today: the next tick in the same hour does not send again.
    await recordJobRun(db(), 'ops-email', true, 'sent 1', at);
    expect((await sendOpsEmails(db(), new Date(at.getTime() + 15 * 60_000), delivery)).skipped).toBe('already_sent_today');
  });
});
