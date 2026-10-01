import 'server-only';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import { locations, moderationActions, reports, tickets, users, workApplications, workPosts, workProfiles } from '@/server/db/schema';
import { WORK_RULES as R } from '@/config/business-rules';
import { EMPLOYMENT_TYPES, PLACE_MODES, WORK_FIELDS, type WorkField } from '@/config/work';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { getScore } from '@/server/domains/reputation/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { dayKey, notify } from '@/server/domains/notifications/service';

/**
 * Trabajo: jobs and professional projects, without auctions.
 *
 * - The employer states the pay; candidates apply with a profile and a
 *   message, never a price. There is no field for a counter-offer anywhere.
 * - Posting promises never to charge candidates: a job that asks for a fee
 *   to apply is the region's commonest employment scam.
 * - Free while professional subscriptions cannot be paid (see WORK_RULES).
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const POST = 'work_post';
const PROFILE = 'work_profile';

export const WORK_REPORT_CATEGORIES = ['scam', 'fraud', 'fake_listing', 'harassment', 'other'] as const;
export type WorkReportCategory = (typeof WORK_REPORT_CATEGORIES)[number];

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

const optionalText = (max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').trim())
    .pipe(z.string().max(max, { message: key }))
    .transform((value) => value || null);

const whatsapp = z.string().transform((value, ctx) => {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'work.error.whatsapp' });
  return normalized ?? '';
});

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'work.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'work.error.account_restricted');
}

// --- Profiles ------------------------------------------------------------------

export const profileInputSchema = z.object({
  headline: text(R.headlineMinLength, R.headlineMaxLength, 'work.error.headline'),
  about: text(R.aboutMinLength, R.aboutMaxLength, 'work.error.about'),
  fields: z
    .array(z.enum(WORK_FIELDS, { message: 'work.error.field' }))
    .min(1, { message: 'work.error.fields' })
    .max(R.maxFieldsPerProfile, { message: 'work.error.fields' })
    .transform((list) => [...new Set(list)]),
  skills: optionalText(R.skillsMaxLength, 'work.error.skills'),
  experienceYears: z.number().int().min(0, { message: 'work.error.experience' }).max(60, { message: 'work.error.experience' }).nullable(),
  portfolioLinks: z
    .array(z.string().trim())
    .transform((list) => list.filter(Boolean))
    .pipe(z.array(z.string().url({ message: 'work.error.link' }).max(300).refine((url) => url.startsWith('https://'), { message: 'work.error.link' })).max(R.maxPortfolioLinks, { message: 'work.error.links' })),
  locationId: z.string().uuid({ message: 'work.error.location' }),
  whatsapp,
  openToWork: z.boolean(),
});
export type ProfileInput = z.output<typeof profileInputSchema>;

export async function saveProfile(tx: Executor, params: { userId: string; input: ProfileInput; audit?: AuditContext }): Promise<void> {
  await activeMember(tx, params.userId);
  const { input } = params;
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('work.error.location');
  const [existing] = await tx.select({ status: workProfiles.status }).from(workProfiles).where(eq(workProfiles.userId, params.userId)).limit(1).for('update');
  if (existing?.status === 'suspended') throw new DomainError('forbidden', 'work.error.suspended');
  const values = {
    headline: input.headline,
    about: input.about,
    fields: input.fields,
    skills: input.skills,
    experienceYears: input.experienceYears,
    portfolioLinks: input.portfolioLinks,
    locationId: input.locationId,
    whatsappE164: input.whatsapp,
    openToWork: input.openToWork,
    updatedAt: new Date(),
  };
  if (existing) await tx.update(workProfiles).set(values).where(eq(workProfiles.userId, params.userId));
  else await tx.insert(workProfiles).values({ userId: params.userId, ...values });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: existing ? 'work.profile_updated' : 'work.profile_created',
    subjectType: PROFILE,
    subjectId: params.userId,
    district: 'works',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { fields: input.fields },
  });
}

export async function getProfile(executor: Executor, userId: string) {
  const [row] = await executor.select().from(workProfiles).where(eq(workProfiles.userId, userId)).limit(1);
  return row ?? null;
}

// --- Posts -----------------------------------------------------------------------

export const postInputSchema = z
  .object({
    kind: z.enum(['job', 'project'], { message: 'work.error.kind' }),
    employment: z.enum(EMPLOYMENT_TYPES, { message: 'work.error.employment' }),
    field: z.enum(WORK_FIELDS, { message: 'work.error.field' }),
    title: text(R.titleMinLength, R.titleMaxLength, 'work.error.title'),
    description: text(R.descriptionMinLength, R.descriptionMaxLength, 'work.error.description'),
    requirements: optionalText(R.requirementsMaxLength, 'work.error.requirements'),
    payText: text(R.payMinLength, R.payMaxLength, 'work.error.pay'),
    companyName: optionalText(R.companyMaxLength, 'work.error.company'),
    locationId: z.string().uuid({ message: 'work.error.location' }),
    placeMode: z.enum(PLACE_MODES, { message: 'work.error.place_mode' }),
    whatsapp,
    noFeePromise: z.literal(true, { message: 'work.error.no_fee' }),
  })
  // A project is freelance by nature; a job is anything but.
  .refine((value) => (value.kind === 'project') === (value.employment === 'freelance'), { message: 'work.error.employment', path: ['employment'] });
export type PostInput = z.output<typeof postInputSchema>;

/** Members whose profile lists the field, in the post's country, once a day per field. */
async function tellMatchingProfessionals(tx: Executor, params: { postId: string; employerUserId: string; field: string; now: Date }) {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select p.user_id
    from work_posts w
    join locations lw on lw.id = w.location_id
    join work_profiles p on p.status = 'active' and p.open_to_work and w.field = any(p.fields) and p.user_id <> w.employer_user_id
    join locations lp on lp.id = p.location_id
    join users u on u.id = p.user_id and u.status = 'active'
    where w.id = ${params.postId}
      and (w.place_mode = 'remote' or exists (
        select 1 from locations c
        where c.level = 'country'
          and (c.code = lw.code or c.code = any(lw.path))
          and (c.code = lp.code or c.code = any(lp.path))
      ))
    limit ${R.newPostNotifyLimit}
  `);
  const day = dayKey(params.now);
  await notify(
    tx,
    rows.map((row) => ({
      userId: row.user_id,
      category: 'work' as const,
      type: 'work.new_posts',
      titleKey: 'notify.work.new_posts',
      href: `/work?field=${params.field}`,
      dedupeKey: `work.new:${params.field}:${day}`,
      subjectId: params.postId,
    })),
  );
}

export async function publishPost(tx: Executor, params: { employerUserId: string; input: PostInput; audit?: AuditContext; now?: Date }): Promise<string> {
  await activeMember(tx, params.employerUserId);
  const now = params.now ?? new Date();
  const { input } = params;
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('work.error.location');
  const [open] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(workPosts)
    .where(and(eq(workPosts.employerUserId, params.employerUserId), eq(workPosts.status, 'open')));
  if ((open?.count ?? 0) >= R.maxOpenPostsPerEmployer) throw errors.conflict('work.error.too_many_posts', { limit: R.maxOpenPostsPerEmployer });
  const [post] = await tx
    .insert(workPosts)
    .values({
      employerUserId: params.employerUserId,
      kind: input.kind,
      employment: input.employment,
      field: input.field,
      title: input.title,
      description: input.description,
      requirements: input.requirements,
      payText: input.payText,
      companyName: input.companyName,
      locationId: input.locationId,
      placeMode: input.placeMode,
      whatsappE164: input.whatsapp,
      expiresAt: new Date(now.getTime() + R.postOpenDays * 86_400_000),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: workPosts.id });
  const id = post!.id;
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.employerUserId,
    action: 'work.post_published',
    subjectType: POST,
    subjectId: id,
    district: 'works',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    // The promise is part of the record: a post found charging candidates broke it.
    metadata: { kind: input.kind, field: input.field, noFeePromise: true },
  });
  await tellMatchingProfessionals(tx, { postId: id, employerUserId: params.employerUserId, field: input.field, now });
  return id;
}

export async function closePost(tx: Executor, params: { employerUserId: string; postId: string; outcome: 'filled' | 'closed' }): Promise<void> {
  const [post] = await tx.select().from(workPosts).where(eq(workPosts.id, params.postId)).limit(1).for('update');
  if (!post || post.employerUserId !== params.employerUserId || post.status === 'removed') throw errors.notFound('work_post');
  if (post.status !== 'open') throw errors.conflict('work.error.closed');
  await tx.update(workPosts).set({ status: params.outcome, updatedAt: new Date() }).where(eq(workPosts.id, post.id));
  // Everyone still waiting hears that it closed; nobody is left wondering.
  const waiting = await tx
    .update(workApplications)
    .set({ status: 'declined', decidedAt: new Date() })
    .where(and(eq(workApplications.postId, post.id), inArray(workApplications.status, ['submitted', 'shortlisted'])))
    .returning({ candidateUserId: workApplications.candidateUserId });
  await notify(
    tx,
    waiting.map((row) => ({ userId: row.candidateUserId, category: 'work' as const, type: 'work.post_closed', titleKey: 'notify.work.post_closed', params: { title: post.title }, href: '/work/mine' })),
  );
  await recordAudit(tx, { actorType: 'user', actorUserId: params.employerUserId, action: `work.post_${params.outcome}`, subjectType: POST, subjectId: post.id, district: 'works' });
}

/** Scheduler job: posts past `postOpenDays` close; the employer and waiting candidates are told. */
export async function expireWorkPosts(database: Database, now = new Date()): Promise<{ closed: number }> {
  return database.transaction(async (tx) => {
    const expired = await tx
      .update(workPosts)
      .set({ status: 'closed', updatedAt: now })
      .where(and(eq(workPosts.status, 'open'), lte(workPosts.expiresAt, now)))
      .returning({ id: workPosts.id, employerUserId: workPosts.employerUserId, title: workPosts.title });
    for (const post of expired) {
      const waiting = await tx
        .update(workApplications)
        .set({ status: 'declined', decidedAt: now })
        .where(and(eq(workApplications.postId, post.id), inArray(workApplications.status, ['submitted', 'shortlisted'])))
        .returning({ candidateUserId: workApplications.candidateUserId });
      await notify(tx, [
        { userId: post.employerUserId, category: 'work', type: 'work.post_expired', titleKey: 'notify.work.post_expired', params: { title: post.title }, href: `/work/posts/${post.id}`, dedupeKey: `work.expired:${post.id}` },
        ...waiting.map((row) => ({ userId: row.candidateUserId, category: 'work' as const, type: 'work.post_closed', titleKey: 'notify.work.post_closed', params: { title: post.title }, href: '/work/mine' })),
      ]);
    }
    return { closed: expired.length };
  });
}

// --- Applications ----------------------------------------------------------------

export const applicationMessageSchema = text(R.messageMinLength, R.messageMaxLength, 'work.error.message');

export async function apply(tx: Executor, params: { candidateUserId: string; postId: string; message: string; audit?: AuditContext }): Promise<string> {
  await activeMember(tx, params.candidateUserId);
  const profile = await getProfile(tx, params.candidateUserId);
  if (!profile) throw new DomainError('forbidden', 'work.error.need_profile');
  if (profile.status !== 'active') throw new DomainError('forbidden', 'work.error.suspended');
  const [post] = await tx.select().from(workPosts).where(eq(workPosts.id, params.postId)).limit(1).for('update');
  if (!post || post.status === 'removed') throw errors.notFound('work_post');
  if (post.status !== 'open') throw errors.conflict('work.error.closed');
  if (post.employerUserId === params.candidateUserId) throw errors.validation('work.error.own');
  const [open] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(workApplications)
    .where(and(eq(workApplications.candidateUserId, params.candidateUserId), inArray(workApplications.status, ['submitted', 'shortlisted'])));
  if ((open?.count ?? 0) >= R.maxOpenApplicationsPerCandidate) throw errors.conflict('work.error.too_many_applications', { limit: R.maxOpenApplicationsPerCandidate });
  const inserted = await tx
    .insert(workApplications)
    .values({ postId: post.id, candidateUserId: params.candidateUserId, message: params.message })
    .onConflictDoNothing()
    .returning({ id: workApplications.id });
  if (inserted.length === 0) throw errors.conflict('work.error.already_applied');
  const id = inserted[0]!.id;
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.candidateUserId,
    action: 'work.application_sent',
    subjectType: POST,
    subjectId: post.id,
    district: 'works',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { applicationId: id },
  });
  await notify(tx, [
    { userId: post.employerUserId, category: 'work', type: 'work.application', titleKey: 'notify.work.application', params: { title: post.title }, href: `/work/posts/${post.id}#applications`, dedupeKey: `work.application:${id}`, subjectId: post.id },
  ]);
  return id;
}

export const APPLICATION_STEPS = ['shortlist', 'decline', 'hire'] as const;
export type ApplicationStep = (typeof APPLICATION_STEPS)[number];

export async function decideApplication(
  tx: Executor,
  params: { employerUserId: string; applicationId: string; step: ApplicationStep; note: string | null },
): Promise<void> {
  await activeMember(tx, params.employerUserId);
  const [row] = await tx
    .select({ application: workApplications, post: workPosts })
    .from(workApplications)
    .innerJoin(workPosts, eq(workPosts.id, workApplications.postId))
    .where(eq(workApplications.id, params.applicationId))
    .limit(1)
    .for('update');
  if (!row || row.post.employerUserId !== params.employerUserId) throw errors.notFound('work_application');
  const { application, post } = row;
  const allowed: Record<ApplicationStep, string[]> = { shortlist: ['submitted'], decline: ['submitted', 'shortlisted'], hire: ['submitted', 'shortlisted'] };
  if (!allowed[params.step].includes(application.status)) throw errors.conflict('work.error.not_open');
  const status = params.step === 'shortlist' ? 'shortlisted' : params.step === 'decline' ? 'declined' : 'hired';
  const note = params.note?.replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
  await tx.update(workApplications).set({ status, decisionNote: note, decidedAt: new Date() }).where(eq(workApplications.id, application.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.employerUserId, action: `work.application_${status}`, subjectType: POST, subjectId: post.id, district: 'works', metadata: { applicationId: application.id } });
  await notify(tx, [
    { userId: application.candidateUserId, category: 'work', type: `work.application_${status}`, titleKey: `notify.work.application_${status}`, params: { title: post.title }, href: `/work/posts/${post.id}`, dedupeKey: `work.decision:${application.id}:${status}`, subjectId: post.id },
  ]);
}

export async function withdrawApplication(tx: Executor, params: { candidateUserId: string; applicationId: string }): Promise<void> {
  const [application] = await tx.select().from(workApplications).where(eq(workApplications.id, params.applicationId)).limit(1).for('update');
  if (!application || application.candidateUserId !== params.candidateUserId) throw errors.notFound('work_application');
  if (application.status !== 'submitted' && application.status !== 'shortlisted') throw errors.conflict('work.error.not_open');
  await tx.update(workApplications).set({ status: 'withdrawn', decidedAt: new Date() }).where(eq(workApplications.id, application.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.candidateUserId, action: 'work.application_withdrawn', subjectType: POST, subjectId: application.postId, district: 'works' });
}

// --- Reports -------------------------------------------------------------------

export async function reportWork(
  tx: Executor,
  params: { reporterUserId: string; subject: 'post' | 'profile'; subjectId: string; category: WorkReportCategory; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const subjectType = params.subject === 'post' ? POST : PROFILE;
  if (params.subject === 'post') {
    const [post] = await tx.select({ employerUserId: workPosts.employerUserId, status: workPosts.status }).from(workPosts).where(eq(workPosts.id, params.subjectId)).limit(1);
    if (!post || post.status === 'removed') throw errors.notFound('work_post');
    if (post.employerUserId === params.reporterUserId) throw errors.validation('work.report.error.own');
  } else {
    const profile = await getProfile(tx, params.subjectId);
    if (!profile) throw errors.notFound('work_profile');
    if (profile.userId === params.reporterUserId) throw errors.validation('work.report.error.own');
  }
  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, subjectType), eq(reports.subjectId, params.subjectId), eq(reports.reporterUserId, params.reporterUserId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };
  const priority = params.category === 'scam' || params.category === 'fraud' || params.category === 'harassment' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType, subjectId: params.subjectId, category: params.category, priority });
  await tx.insert(reports).values({ reporterUserId: params.reporterUserId, subjectType, subjectId: params.subjectId, district: 'works', category: params.category, description: params.description, evidence: [], ticketId });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.reporterUserId, action: `work.${params.subject}_reported`, subjectType, subjectId: params.subjectId, district: 'works', metadata: { category: params.category, ticketId } });
  return { ticketCode: ticket!.code, duplicate: false };
}

export const WORK_TICKET_DECISIONS = ['dismiss', 'remove_post', 'suspend_profile'] as const;
export type WorkTicketDecision = (typeof WORK_TICKET_DECISIONS)[number];

export async function resolveWorkTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: WorkTicketDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'work.moderate');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectType: tickets.subjectType, subjectId: tickets.subjectId, status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), inArray(tickets.subjectType, [POST, PROFILE])))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  if (params.decision !== 'dismiss' && !params.note) throw errors.validation('work.error.review_note');
  if (params.decision === 'remove_post' && ticket.subjectType !== POST) throw errors.validation('work.error.decision');
  if (params.decision === 'suspend_profile' && ticket.subjectType !== PROFILE) throw errors.validation('work.error.decision');
  let ownerUserId: string;
  if (ticket.subjectType === POST) {
    const [post] = await tx.select({ employerUserId: workPosts.employerUserId }).from(workPosts).where(eq(workPosts.id, ticket.subjectId)).limit(1).for('update');
    if (!post) throw errors.notFound('work_post');
    ownerUserId = post.employerUserId;
    if (params.decision === 'remove_post') await tx.update(workPosts).set({ status: 'removed', removedBy: actor.userId, updatedAt: new Date() }).where(eq(workPosts.id, ticket.subjectId));
  } else {
    ownerUserId = ticket.subjectId;
    if (params.decision === 'suspend_profile') await tx.update(workProfiles).set({ status: 'suspended', openToWork: false, updatedAt: new Date() }).where(eq(workProfiles.userId, ticket.subjectId));
  }
  if (ownerUserId === actor.userId) throw errors.forbidden('work.moderate');
  if (params.decision !== 'dismiss') {
    await notify(tx, [{ userId: ownerUserId, category: 'moderation', type: `work.${params.decision}`, titleKey: params.decision === 'remove_post' ? 'notify.work.post_removed' : 'notify.work.profile_suspended', href: '/work/mine' }]);
  }
  const actedOn = params.decision !== 'dismiss';
  await tx
    .update(tickets)
    .set({ status: actedOn ? 'resolved' : 'rejected', resolutionSummary: actedOn ? 'moderation.resolution.removed' : 'moderation.resolution.no_action', assignedTo: actor.userId, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(tickets.id, ticket.id));
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `work_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `moderation.work_${params.decision}`, subjectType: ticket.subjectType, subjectId: ticket.subjectId, district: 'works', metadata: { ticketId: ticket.id } });
}

// --- Reading -----------------------------------------------------------------

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

export type PostCard = {
  id: string;
  kind: 'job' | 'project';
  employment: string;
  field: string;
  title: string;
  description: string;
  payText: string;
  companyName: string | null;
  placeMode: string;
  placeName: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  employerName: string;
  applicationCount: number;
};

const cardColumns = {
  id: workPosts.id,
  kind: workPosts.kind,
  employment: workPosts.employment,
  field: workPosts.field,
  title: workPosts.title,
  description: workPosts.description,
  payText: workPosts.payText,
  companyName: workPosts.companyName,
  placeMode: workPosts.placeMode,
  status: workPosts.status,
  createdAt: workPosts.createdAt,
  expiresAt: workPosts.expiresAt,
  placeName: locations.name,
  placeNames: locations.names,
  employerName: users.displayName,
  applicationCount: sql<number>`(select count(*)::int from work_applications a where a.post_id = ${workPosts.id} and a.status <> 'withdrawn')`,
};

type CardRow = Omit<PostCard, 'placeName'> & { placeName: string; placeNames: unknown };
const toCard = (row: CardRow, locale: string): PostCard => {
  const { placeNames, ...rest } = row;
  return { ...rest, placeName: localized(row.placeName, placeNames, locale) };
};

export async function listPosts(
  executor: Executor,
  params: { locale: string; field?: string; kind?: string; placeCode?: string; remoteOnly?: boolean; page?: number },
): Promise<{ items: PostCard[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const conditions = [eq(workPosts.status, 'open')];
  if (params.field && (WORK_FIELDS as readonly string[]).includes(params.field)) conditions.push(eq(workPosts.field, params.field));
  if (params.kind === 'job' || params.kind === 'project') conditions.push(eq(workPosts.kind, params.kind));
  if (params.remoteOnly) conditions.push(eq(workPosts.placeMode, 'remote'));
  if (params.placeCode) conditions.push(sql`(${locations.code} = ${params.placeCode} or ${params.placeCode} = any(${locations.path}))`);
  const rows = await executor
    .select(cardColumns)
    .from(workPosts)
    .innerJoin(locations, eq(locations.id, workPosts.locationId))
    .innerJoin(users, eq(users.id, workPosts.employerUserId))
    .where(and(...conditions))
    .orderBy(desc(workPosts.createdAt))
    .limit(R.pageSize + 1)
    .offset((page - 1) * R.pageSize);
  return { items: rows.slice(0, R.pageSize).map((row) => toCard(row as CardRow, params.locale)), hasMore: rows.length > R.pageSize, page };
}

export type ProfileSummary = {
  userId: string;
  displayName: string;
  yayId: string;
  headline: string;
  about: string;
  fields: string[];
  skills: string | null;
  experienceYears: number | null;
  portfolioLinks: string[];
  placeName: string;
  openToWork: boolean;
  reputation: number;
  status: string;
};

async function profileSummaries(executor: Executor, userIds: string[], locale: string): Promise<Map<string, ProfileSummary>> {
  if (userIds.length === 0) return new Map();
  const rows = await executor
    .select({ profile: workProfiles, displayName: users.displayName, yayDigits: users.yayId, placeName: locations.name, placeNames: locations.names })
    .from(workProfiles)
    .innerJoin(users, eq(users.id, workProfiles.userId))
    .innerJoin(locations, eq(locations.id, workProfiles.locationId))
    .where(inArray(workProfiles.userId, userIds));
  const map = new Map<string, ProfileSummary>();
  for (const row of rows) {
    map.set(row.profile.userId, {
      userId: row.profile.userId,
      displayName: row.displayName,
      yayId: formatYayId(row.yayDigits),
      headline: row.profile.headline,
      about: row.profile.about,
      fields: row.profile.fields,
      skills: row.profile.skills,
      experienceYears: row.profile.experienceYears,
      portfolioLinks: row.profile.portfolioLinks,
      placeName: localized(row.placeName, row.placeNames, locale),
      openToWork: row.profile.openToWork,
      reputation: await getScore(executor, row.profile.userId),
      status: row.profile.status,
    });
  }
  return map;
}

export async function profilePage(executor: Executor, params: { yayDigits: string; locale: string }) {
  const [user] = await executor.select({ id: users.id }).from(users).where(eq(users.yayId, params.yayDigits)).limit(1);
  if (!user) return null;
  const summary = (await profileSummaries(executor, [user.id], params.locale)).get(user.id);
  if (!summary || summary.status !== 'active') return null;
  return summary;
}

export type ApplicationView = {
  id: string;
  message: string;
  status: string;
  decisionNote: string | null;
  createdAt: Date;
  candidate: ProfileSummary | null;
  /** The candidate's WhatsApp, for the employer: applying is consent to be contacted about the job. */
  whatsappE164: string | null;
};

export async function getPost(executor: Executor, params: { postId: string; viewerId: string | null; viewerIsModerator: boolean; locale: string }) {
  const [row] = await executor
    .select({ ...cardColumns, employerUserId: workPosts.employerUserId, requirements: workPosts.requirements, whatsappE164: workPosts.whatsappE164, employerYay: users.yayId })
    .from(workPosts)
    .innerJoin(locations, eq(locations.id, workPosts.locationId))
    .innerJoin(users, eq(users.id, workPosts.employerUserId))
    .where(eq(workPosts.id, params.postId))
    .limit(1);
  if (!row) return null;
  const isEmployer = row.employerUserId === params.viewerId;
  if (row.status === 'removed' && !isEmployer && !params.viewerIsModerator) return null;

  let applications: ApplicationView[] = [];
  if (isEmployer) {
    const rows = await executor
      .select({ application: workApplications, whatsappE164: workProfiles.whatsappE164 })
      .from(workApplications)
      .innerJoin(workProfiles, eq(workProfiles.userId, workApplications.candidateUserId))
      .where(and(eq(workApplications.postId, row.id), ne(workApplications.status, 'withdrawn')))
      .orderBy(asc(workApplications.createdAt));
    const summaries = await profileSummaries(executor, rows.map((r) => r.application.candidateUserId), params.locale);
    applications = rows.map((r) => ({
      id: r.application.id,
      message: r.application.message,
      status: r.application.status,
      decisionNote: r.application.decisionNote,
      createdAt: r.application.createdAt,
      candidate: summaries.get(r.application.candidateUserId) ?? null,
      whatsappE164: r.whatsappE164,
    }));
  }
  const [mine] = params.viewerId
    ? await executor
        .select({ id: workApplications.id, status: workApplications.status, decisionNote: workApplications.decisionNote })
        .from(workApplications)
        .where(and(eq(workApplications.postId, row.id), eq(workApplications.candidateUserId, params.viewerId)))
        .limit(1)
    : [];
  return {
    post: { ...toCard(row as CardRow, params.locale), requirements: row.requirements, employerYayId: formatYayId(row.employerYay) },
    employerReputation: await getScore(executor, row.employerUserId),
    isEmployer,
    applications,
    myApplication: mine ?? null,
    // The employer's WhatsApp, for a candidate they shortlisted or hired.
    employerWhatsapp: mine && (mine.status === 'shortlisted' || mine.status === 'hired') ? row.whatsappE164 : null,
  };
}

export async function myPosts(executor: Executor, params: { userId: string; locale: string }) {
  const rows = await executor
    .select(cardColumns)
    .from(workPosts)
    .innerJoin(locations, eq(locations.id, workPosts.locationId))
    .innerJoin(users, eq(users.id, workPosts.employerUserId))
    .where(and(eq(workPosts.employerUserId, params.userId), ne(workPosts.status, 'removed')))
    .orderBy(desc(workPosts.createdAt))
    .limit(50);
  return rows.map((row) => toCard(row as CardRow, params.locale));
}

export async function myApplications(executor: Executor, params: { userId: string; locale: string }) {
  const rows = await executor
    .select({ ...cardColumns, applicationId: workApplications.id, applicationStatus: workApplications.status })
    .from(workApplications)
    .innerJoin(workPosts, eq(workPosts.id, workApplications.postId))
    .innerJoin(locations, eq(locations.id, workPosts.locationId))
    .innerJoin(users, eq(users.id, workPosts.employerUserId))
    .where(and(eq(workApplications.candidateUserId, params.userId), ne(workPosts.status, 'removed')))
    .orderBy(desc(workApplications.createdAt))
    .limit(50);
  return rows.map((row) => ({ ...toCard(row as CardRow, params.locale), applicationId: row.applicationId, applicationStatus: row.applicationStatus }));
}

export async function workReviewQueue(executor: Executor, actor: AuthContext | null, locale: string) {
  await requirePermission(executor, actor, 'work.moderate');
  const open = await executor
    .select({ ticketId: tickets.id, code: tickets.code, priority: tickets.priority, subjectType: tickets.subjectType, subjectId: tickets.subjectId })
    .from(tickets)
    .where(and(inArray(tickets.subjectType, [POST, PROFILE]), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = open.map((t) => t.ticketId);
  const reported = ids.length ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description }).from(reports).where(inArray(reports.ticketId, ids)) : [];
  const postIds = open.filter((t) => t.subjectType === POST).map((t) => t.subjectId);
  const titles = postIds.length ? await executor.select({ id: workPosts.id, title: workPosts.title, payText: workPosts.payText }).from(workPosts).where(inArray(workPosts.id, postIds)) : [];
  const profiles = await profileSummaries(executor, open.filter((t) => t.subjectType === PROFILE).map((t) => t.subjectId), locale);
  return open.map((ticket) => ({
    ...ticket,
    kind: ticket.subjectType === POST ? ('post' as const) : ('profile' as const),
    label: ticket.subjectType === POST ? (titles.find((p) => p.id === ticket.subjectId)?.title ?? '—') : (profiles.get(ticket.subjectId)?.displayName ?? '—'),
    yayId: ticket.subjectType === PROFILE ? (profiles.get(ticket.subjectId)?.yayId ?? null) : null,
    reports: reported.filter((r) => r.ticketId === ticket.ticketId),
  }));
}

export function isWorkField(value: string): value is WorkField {
  return (WORK_FIELDS as readonly string[]).includes(value);
}
