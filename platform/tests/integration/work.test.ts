import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, locations, users, workEmployers, workPosts } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { listNotifications } from '@/server/domains/notifications/service';
import {
  apply,
  closePost,
  decideApplication,
  employerInputSchema,
  employerReviewQueue,
  getEmployer,
  reviewEmployer,
  saveEmployer,
  expireWorkPosts,
  getPost,
  listPosts,
  postInputSchema,
  profileInputSchema,
  publishPost,
  reportWork,
  resolveWorkTicket,
  saveProfile,
  workReviewQueue,
} from '@/server/domains/work/service';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'work-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function member(name = 'Persona') {
  const { userId } = await register(
    db(),
    { email: `wk-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const business = (overrides: Record<string, unknown> = {}) =>
  employerInputSchema.parse({
    kind: 'business',
    name: 'Ferretería El Sol',
    registration: 'J0310000012345',
    about: 'Ferretería familiar en el centro de León desde 1998. Contratamos vendedores y técnicos.',
    website: '',
    locationId: placeId,
    whatsapp: '+505 8888 3333',
    ...overrides,
  });

/** An employer a reviewer already approved: the state every post needs. */
async function verifiedEmployer(name = 'Ferretería') {
  const userId = await member(name);
  await db().transaction((tx) => saveEmployer(tx, { userId, input: business() }));
  await db().update(workEmployers).set({ status: 'approved' }).where(eq(workEmployers.userId, userId));
  return userId;
}

const job = (overrides: Record<string, unknown> = {}) =>
  postInputSchema.parse({
    kind: 'job',
    employment: 'full_time',
    field: 'technology',
    title: 'Técnico de soporte informático',
    description: 'Buscamos una persona para dar soporte a 30 computadoras de oficina, redes e impresoras. Horario de lunes a viernes.',
    requirements: 'Dos años de experiencia.',
    payText: 'C$18,000 al mes',
    companyName: 'Ferretería El Sol',
    locationId: placeId,
    placeMode: 'onsite',
    whatsapp: '+505 8888 2222',
    noFeePromise: true,
    ...overrides,
  });

const profile = (overrides: Record<string, unknown> = {}) =>
  profileInputSchema.parse({
    headline: 'Técnico en redes y soporte',
    about: 'Cinco años manteniendo redes de oficinas pequeñas y medianas en León y Chinandega.',
    fields: ['technology'],
    skills: 'Redes, Windows, impresoras',
    experienceYears: 5,
    portfolioLinks: [''],
    locationId: placeId,
    whatsapp: '+505 8888 3333',
    openToWork: true,
    ...overrides,
  });

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
  placeId = place!.id;
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('posting without auctions', () => {
  it('requires the pay up front and the promise never to charge candidates', () => {
    expect(postInputSchema.safeParse({ ...job(), payText: '' }).success).toBe(false);
    expect(postInputSchema.safeParse({ ...job(), noFeePromise: false }).success).toBe(false);
    expect(postInputSchema.safeParse({ ...job(), kind: 'project', employment: 'full_time' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile(), portfolioLinks: ['http://insecure.example'] }).success).toBe(false);
  });

  it('tells professionals in the field, once a day', async () => {
    const pro = await member('Carlos');
    await db().transaction((tx) => saveProfile(tx, { userId: pro, input: profile() }));
    const designer = await member('Diseñadora');
    await db().transaction((tx) => saveProfile(tx, { userId: designer, input: profile({ fields: ['design'] }) }));
    const employer = await verifiedEmployer('Ferretería');
    await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job({ title: 'Técnico de redes' }) }));
    expect((await listNotifications(db(), pro)).map((n) => n.titleKey)).toEqual(['notify.work.new_posts']);
    expect(await listNotifications(db(), designer)).toHaveLength(0);
    expect((await listPosts(db(), { locale: 'es', field: 'technology' })).items).toHaveLength(2);
  });
});

describe('applying', () => {
  it('needs a profile; the employer sees the candidate, shortlists, and the candidate gets the contact', async () => {
    const employer = await verifiedEmployer('Ferretería');
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    const candidate = await member('Carlos');
    await expect(db().transaction((tx) => apply(tx, { candidateUserId: candidate, postId, message: 'Me interesa mucho el puesto, tengo experiencia.' }))).rejects.toMatchObject({ messageKey: 'work.error.need_profile' });
    await db().transaction((tx) => saveProfile(tx, { userId: candidate, input: profile() }));
    const appId = await db().transaction((tx) => apply(tx, { candidateUserId: candidate, postId, message: 'Me interesa mucho el puesto, tengo experiencia.' }));
    await expect(db().transaction((tx) => apply(tx, { candidateUserId: employer, postId, message: 'Mi propia oferta, por probar.' }))).rejects.toMatchObject({ messageKey: 'work.error.need_profile' });
    expect((await listNotifications(db(), employer)).map((n) => n.titleKey)).toContain('notify.work.application');

    const asEmployer = await getPost(db(), { postId, viewerId: employer, viewerIsModerator: false, locale: 'es' });
    expect(asEmployer?.applications[0]).toMatchObject({ id: appId, whatsappE164: '+50588883333' });
    expect(asEmployer?.applications[0]?.candidate?.headline).toBe('Técnico en redes y soporte');
    expect((await getPost(db(), { postId, viewerId: candidate, viewerIsModerator: false, locale: 'es' }))?.employerWhatsapp).toBeNull();

    await db().transaction((tx) => decideApplication(tx, { employerUserId: employer, applicationId: appId, step: 'shortlist', note: null }));
    expect((await getPost(db(), { postId, viewerId: candidate, viewerIsModerator: false, locale: 'es' }))?.employerWhatsapp).toBe('+50588882222');
    await db().transaction((tx) => decideApplication(tx, { employerUserId: employer, applicationId: appId, step: 'hire', note: '¡Bienvenido!' }));
    expect((await listNotifications(db(), candidate)).map((n) => n.titleKey)).toEqual(expect.arrayContaining(['notify.work.application_shortlisted', 'notify.work.application_hired']));
  });

  it('closing a post tells everyone still waiting', async () => {
    const employer = await verifiedEmployer();
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    const candidate = await member();
    await db().transaction((tx) => saveProfile(tx, { userId: candidate, input: profile() }));
    await db().transaction((tx) => apply(tx, { candidateUserId: candidate, postId, message: 'Me interesa mucho el puesto, tengo experiencia.' }));
    await db().transaction((tx) => closePost(tx, { employerUserId: employer, postId, outcome: 'filled' }));
    expect((await listNotifications(db(), candidate)).map((n) => n.titleKey)).toContain('notify.work.post_closed');
  });

  it('expires old posts', async () => {
    const employer = await verifiedEmployer();
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    await db().update(workPosts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(workPosts.id, postId));
    expect(await expireWorkPosts(db())).toEqual({ closed: 1 });
    expect((await listPosts(db(), { locale: 'es' })).items).toHaveLength(0);
  });
});

describe('reports', () => {
  it('lets a moderator remove a post that charges candidates', async () => {
    const employer = await verifiedEmployer();
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    const candidate = await member();
    await db().transaction((tx) => reportWork(tx, { reporterUserId: candidate, subject: 'post', subjectId: postId, category: 'scam', description: 'Piden C$500 por la capacitación.' }));
    const mod = await member('Moderadora');
    await db().transaction((tx) => grantRole(tx, { userId: mod, roleKey: 'moderator', grantedBy: null }));
    const [ticket] = await workReviewQueue(db(), { userId: mod, status: 'active' }, 'es');
    expect(ticket?.priority).toBe('high');
    await db().transaction((tx) => resolveWorkTicket(tx, { actor: { userId: mod, status: 'active' }, ticketId: ticket!.ticketId, decision: 'remove_post', note: 'Cobraba a los candidatos.' }));
    expect(await getPost(db(), { postId, viewerId: candidate, viewerIsModerator: false, locale: 'es' })).toBeNull();
    const audits = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'moderation.work_remove_post'), eq(auditEvents.subjectId, postId)));
    expect(audits).toHaveLength(1);
  });

  it('lets only a verified employer post, under the verified name', async () => {
    const userId = await member('Dueño');
    await expect(db().transaction((tx) => publishPost(tx, { employerUserId: userId, input: job() }))).rejects.toMatchObject({ messageKey: 'work.error.employer_needed' });
    await db().transaction((tx) => saveEmployer(tx, { userId, input: business() }));
    await expect(db().transaction((tx) => publishPost(tx, { employerUserId: userId, input: job() }))).rejects.toMatchObject({ messageKey: 'work.error.employer_pending' });

    const reviewer = await member('Revisora');
    await db().transaction((tx) => grantRole(tx, { userId: reviewer, roleKey: 'district_reviewer', grantedBy: null }));
    const queue = await employerReviewQueue(db(), { userId: reviewer, status: 'active' });
    expect(queue.map((e) => e.userId)).toContain(userId);
    await expect(db().transaction((tx) => reviewEmployer(tx, { actor: { userId: reviewer, status: 'active' }, employerUserId: userId, decision: 'reject', note: null }))).rejects.toMatchObject({ messageKey: 'work.error.review_note' });
    await db().transaction((tx) => reviewEmployer(tx, { actor: { userId: reviewer, status: 'active' }, employerUserId: userId, decision: 'approve', note: null }));
    expect((await listNotifications(db(), userId)).some((n) => n.titleKey === 'notify.work.employer_approved')).toBe(true);

    // A name typed into the post is ignored: a business posts as itself.
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: userId, input: { ...job(), companyName: 'Banco Central' } as never }));
    const [post] = await db().select().from(workPosts).where(eq(workPosts.id, postId));
    expect(post!.companyName).toBe('Ferretería El Sol');
    const page = await listPosts(db(), { locale: 'es' });
    expect(page.items.find((p) => p.id === postId)?.employerVerified).toBe('business');
  });

  it('sends an employer back to review when who they are changes, but not for a new phone', async () => {
    const userId = await verifiedEmployer('Dueña');
    await db().transaction((tx) => saveEmployer(tx, { userId, input: business({ whatsapp: '+505 8888 4444' }) }));
    expect((await getEmployer(db(), userId))?.status).toBe('approved');
    const result = await db().transaction((tx) => saveEmployer(tx, { userId, input: business({ name: 'Banco Central de Nicaragua' }) }));
    expect(result.reReview).toBe(true);
    expect((await getEmployer(db(), userId))?.status).toBe('pending');
  });

  it('requires a registration number from a business, not from a person', () => {
    const raw = { kind: 'business', name: 'Ferretería El Sol', registration: '', about: 'Ferretería familiar en el centro de León desde 1998.', website: '', locationId: placeId, whatsapp: '+505 8888 3333' };
    expect(employerInputSchema.safeParse(raw).success).toBe(false);
    expect(employerInputSchema.safeParse({ ...raw, kind: 'person', name: 'María José López' }).success).toBe(true);
  });

  it('suspending an employer takes their offers down and tells waiting candidates', async () => {
    const employer = await verifiedEmployer();
    const postId = await db().transaction((tx) => publishPost(tx, { employerUserId: employer, input: job() }));
    const candidate = await member('Carlos');
    await db().transaction((tx) => saveProfile(tx, { userId: candidate, input: profile() }));
    await db().transaction((tx) => apply(tx, { candidateUserId: candidate, postId, message: 'Tengo cinco años de experiencia en soporte y redes.' }));
    const reviewer = await member('Revisora');
    await db().transaction((tx) => grantRole(tx, { userId: reviewer, roleKey: 'moderator', grantedBy: null }));
    await db().transaction((tx) => reviewEmployer(tx, { actor: { userId: reviewer, status: 'active' }, employerUserId: employer, decision: 'suspend', note: 'Pedía dinero a candidatos.' }));
    const [post] = await db().select().from(workPosts).where(eq(workPosts.id, postId));
    expect(post!.status).toBe('removed');
    expect((await listNotifications(db(), candidate)).some((n) => n.titleKey === 'notify.work.post_closed')).toBe(true);
    await expect(db().transaction((tx) => saveEmployer(tx, { userId: employer, input: business() }))).rejects.toMatchObject({ messageKey: 'work.error.employer_suspended' });
  });
});
