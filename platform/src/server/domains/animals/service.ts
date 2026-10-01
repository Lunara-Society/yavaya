import 'server-only';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import {
  animalsApplications,
  animalsCertificates,
  animalsListingPhotos,
  animalsListings,
  animalsRescuers,
  locations,
  moderationActions,
  reports,
  tickets,
  users,
  type ApplicationAnswers,
} from '@/server/db/schema';
import { ANIMALS_RULES as R } from '@/config/business-rules';
import { COMMITMENTS, HOME_TYPES, QUIZ, RESCUER_KINDS, SEXES, SIZES, SLEEPS, SPECIES, TENURES, YES_NO_NA } from '@/config/animals';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { applyRule } from '@/server/domains/reputation/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { insertMediaRows, markRemoved, type StoredImage } from '@/server/domains/media/service';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { notify } from '@/server/domains/notifications/service';

/**
 * Animales: welfare first, adoption earned. See the schema for the three
 * gates. Free throughout: no animal has a price, and nothing here is billed.
 * Every change is audited in the transaction that makes it.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const LISTING = 'animals_listing';
const RESCUER = 'animals_rescuer';
export const PHOTO_PURPOSE = 'animal_photo';

export const ANIMALS_REPORT_CATEGORIES = ['animal_abuse', 'scam', 'fake_listing', 'other'] as const;
export type AnimalsReportCategory = (typeof ANIMALS_REPORT_CATEGORIES)[number];

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

const optionalText = (max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, { message: key }))
    .transform((value) => value || null);

const whatsapp = z.string().transform((value, ctx) => {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'animals.error.whatsapp' });
  return normalized ?? '';
});

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'animals.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'animals.error.account_restricted');
}

// --- Learn: the guide's quiz and the certificate -------------------------------

export type QuizResult = { score: number; total: number; passed: boolean; wrong: number[] };

/**
 * Marks the quiz. Passing grants (or keeps) the certificate; failing never
 * takes one away. Retrying is allowed at once: the point is to learn the
 * answers, and the results page explains every one.
 */
export async function submitQuiz(tx: Executor, params: { userId: string; answers: Array<number | null> }): Promise<QuizResult> {
  await activeMember(tx, params.userId);
  const wrong = QUIZ.filter((question, index) => params.answers[index] !== question.correct).map((question) => question.id);
  const score = QUIZ.length - wrong.length;
  const passed = score >= R.quizPassMark;
  if (passed) {
    await tx
      .insert(animalsCertificates)
      .values({ userId: params.userId, version: R.certificateVersion, score })
      .onConflictDoUpdate({
        target: animalsCertificates.userId,
        set: { version: R.certificateVersion, score: sql`greatest(${animalsCertificates.score}, ${score})`, passedAt: new Date() },
      });
    await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'animals.certificate_granted', subjectType: 'user', subjectId: params.userId, district: 'animals', metadata: { score, version: R.certificateVersion } });
  }
  return { score, total: QUIZ.length, passed, wrong };
}

export async function getCertificate(executor: Executor, userId: string) {
  const [row] = await executor.select().from(animalsCertificates).where(eq(animalsCertificates.userId, userId)).limit(1);
  return row ?? null;
}

// --- Rescuers ------------------------------------------------------------------

export const rescuerInputSchema = z.object({
  kind: z.enum(RESCUER_KINDS, { message: 'animals.error.kind' }),
  name: text(R.rescuerNameMinLength, R.rescuerNameMaxLength, 'animals.error.rescuer_name'),
  about: text(R.rescuerAboutMinLength, R.rescuerAboutMaxLength, 'animals.error.rescuer_about'),
  locationId: z.string().uuid({ message: 'animals.error.location' }),
  whatsapp,
});
export type RescuerInput = z.output<typeof rescuerInputSchema>;

/** Applying, or changing what was reviewed: either way it goes (back) to review. */
export async function applyAsRescuer(tx: Executor, params: { userId: string; input: RescuerInput; audit?: AuditContext }): Promise<void> {
  await activeMember(tx, params.userId);
  const { input } = params;
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('animals.error.location');
  const [existing] = await tx.select().from(animalsRescuers).where(eq(animalsRescuers.userId, params.userId)).limit(1).for('update');
  if (existing?.status === 'suspended') throw new DomainError('forbidden', 'animals.error.rescuer_suspended');
  const values = { kind: input.kind, name: input.name, about: input.about, locationId: input.locationId, whatsappE164: input.whatsapp, updatedAt: new Date() };
  // A phone number can change without a new review; who you are cannot.
  const identityChanged = !existing || existing.kind !== input.kind || existing.name !== input.name || existing.about !== input.about || existing.locationId !== input.locationId;
  if (existing) {
    await tx
      .update(animalsRescuers)
      .set(identityChanged ? { ...values, status: 'pending', reviewNote: null, reviewedBy: null, reviewedAt: null } : values)
      .where(eq(animalsRescuers.userId, params.userId));
  } else {
    await tx.insert(animalsRescuers).values({ userId: params.userId, ...values });
  }
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: existing ? 'animals.rescuer_updated' : 'animals.rescuer_applied',
    subjectType: RESCUER,
    subjectId: params.userId,
    district: 'animals',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { kind: input.kind, reReview: identityChanged },
  });
}

export const RESCUER_DECISIONS = ['approve', 'reject', 'suspend'] as const;
export type RescuerDecision = (typeof RESCUER_DECISIONS)[number];

export async function reviewRescuer(
  tx: Executor,
  params: { actor: AuthContext | null; rescuerUserId: string; decision: RescuerDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'adoptions.review');
  if (actor.userId === params.rescuerUserId) throw errors.forbidden('adoptions.review');
  const [rescuer] = await tx.select().from(animalsRescuers).where(eq(animalsRescuers.userId, params.rescuerUserId)).limit(1).for('update');
  if (!rescuer) throw errors.notFound('animals_rescuer');
  if (params.decision === 'suspend' && rescuer.status !== 'approved') throw errors.conflict('animals.error.not_approved');
  if (params.decision !== 'suspend' && rescuer.status !== 'pending') throw errors.conflict('animals.error.not_pending');
  if (params.decision !== 'approve' && !params.note) throw errors.validation('animals.error.review_note');
  const status = params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'suspended';
  await tx
    .update(animalsRescuers)
    .set({ status, reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(animalsRescuers.userId, rescuer.userId));
  if (status === 'suspended') {
    // A suspended rescuer's animals stop being offered; their homes-in-progress
    // are left for a reviewer to look at, not silently cancelled.
    await tx
      .update(animalsListings)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(and(eq(animalsListings.rescuerUserId, rescuer.userId), eq(animalsListings.status, 'available')));
  }
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `animals.rescuer_${status}`, subjectType: RESCUER, subjectId: rescuer.userId, district: 'animals' });
  await notify(tx, [{ userId: rescuer.userId, category: 'animals', type: `animals.rescuer_${status}`, titleKey: `notify.animals.rescuer_${status}`, href: '/animals/rescuer' }]);
}

// --- Listings ------------------------------------------------------------------

export const listingInputSchema = z.object({
  species: z.enum(SPECIES, { message: 'animals.error.species' }),
  name: text(1, R.nameMaxLength, 'animals.error.name'),
  sex: z.enum(SEXES, { message: 'animals.error.sex' }),
  size: z.enum(SIZES, { message: 'animals.error.size' }),
  ageMonths: z.number().int().min(0).max(360).nullable(),
  sterilised: z.boolean(),
  vaccinated: z.boolean(),
  dewormed: z.boolean(),
  healthNotes: optionalText(R.notesMaxLength, 'animals.error.notes'),
  temperament: optionalText(R.notesMaxLength, 'animals.error.notes'),
  description: text(R.descriptionMinLength, R.descriptionMaxLength, 'animals.error.description'),
  locationId: z.string().uuid({ message: 'animals.error.location' }),
});
export type ListingInput = z.output<typeof listingInputSchema>;

async function approvedRescuer(executor: Executor, userId: string) {
  const [rescuer] = await executor.select().from(animalsRescuers).where(eq(animalsRescuers.userId, userId)).limit(1);
  if (!rescuer || rescuer.status !== 'approved') throw new DomainError('forbidden', 'animals.error.not_rescuer');
  return rescuer;
}

export async function publishAnimal(
  tx: Executor,
  params: { rescuerUserId: string; input: ListingInput; images: StoredImage[]; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.rescuerUserId);
  await approvedRescuer(tx, params.rescuerUserId);
  if (params.images.length < R.minPhotos || params.images.length > R.maxPhotos) throw errors.validation('animals.error.photo_count', { min: R.minPhotos, max: R.maxPhotos });
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, params.input.locationId)).limit(1);
  if (!place) throw errors.validation('animals.error.location');
  const [active] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(animalsListings)
    .where(and(eq(animalsListings.rescuerUserId, params.rescuerUserId), inArray(animalsListings.status, ['available', 'reserved'])));
  if ((active?.count ?? 0) >= R.maxActiveListingsPerRescuer) throw errors.conflict('animals.error.too_many_listings', { limit: R.maxActiveListingsPerRescuer });

  const [listing] = await tx.insert(animalsListings).values({ rescuerUserId: params.rescuerUserId, ...params.input }).returning({ id: animalsListings.id });
  const id = listing!.id;
  await insertMediaRows(tx, { ownerUserId: params.rescuerUserId, purpose: PHOTO_PURPOSE, images: params.images });
  await tx.insert(animalsListingPhotos).values(params.images.map((image, position) => ({ listingId: id, mediaId: image.id, position })));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.rescuerUserId,
    action: 'animals.listing_published',
    subjectType: LISTING,
    subjectId: id,
    district: 'animals',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { species: params.input.species },
  });
  return id;
}

/** The rescuer takes an animal off: it found a home elsewhere, or died, or cannot be placed. */
export async function withdrawAnimal(tx: Executor, params: { rescuerUserId: string; listingId: string }): Promise<void> {
  const [listing] = await tx.select().from(animalsListings).where(eq(animalsListings.id, params.listingId)).limit(1).for('update');
  if (!listing || listing.rescuerUserId !== params.rescuerUserId) throw errors.notFound('animals_listing');
  if (listing.status !== 'available' && listing.status !== 'reserved') throw errors.conflict('animals.error.not_available');
  await tx.update(animalsListings).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(animalsListings.id, listing.id));
  const open = await tx
    .update(animalsApplications)
    .set({ status: 'rejected', decisionNote: null, decidedAt: new Date() })
    .where(and(eq(animalsApplications.listingId, listing.id), inArray(animalsApplications.status, ['submitted', 'approved'])))
    .returning({ applicantUserId: animalsApplications.applicantUserId });
  await notify(
    tx,
    open.map((row) => ({ userId: row.applicantUserId, category: 'animals' as const, type: 'animals.listing_closed', titleKey: 'notify.animals.listing_closed', params: { name: listing.name }, href: '/animals/mine' })),
  );
  await recordAudit(tx, { actorType: 'user', actorUserId: params.rescuerUserId, action: 'animals.listing_withdrawn', subjectType: LISTING, subjectId: listing.id, district: 'animals' });
}

// --- Applications --------------------------------------------------------------

const answer = text(R.answerMinLength, R.answerMaxLength, 'animals.error.answer');

export const applicationInputSchema = z.object({
  answers: z.object({
    homeType: z.enum(HOME_TYPES, { message: 'animals.error.answer_missing' }),
    tenure: z.enum(TENURES, { message: 'animals.error.answer_missing' }),
    landlordAllows: z.enum(YES_NO_NA, { message: 'animals.error.answer_missing' }),
    fencedYard: z.enum(YES_NO_NA, { message: 'animals.error.answer_missing' }),
    household: answer,
    allAgree: z.literal(true, { message: 'animals.error.all_agree' }),
    otherAnimals: answer,
    otherAnimalsSterilised: z.enum(YES_NO_NA, { message: 'animals.error.answer_missing' }),
    experience: answer,
    hoursAlone: z.number().int().min(0, { message: 'animals.error.hours' }).max(24, { message: 'animals.error.hours' }),
    sleepsWhere: z.enum(SLEEPS, { message: 'animals.error.answer_missing' }),
    vetPlan: answer,
    whyAdopt: answer,
  }),
  commitments: z
    .array(z.enum(COMMITMENTS))
    .transform((list) => [...new Set(list)])
    .refine((list) => COMMITMENTS.every((key) => list.includes(key)), { message: 'animals.error.commitments' }),
});
export type ApplicationInput = z.output<typeof applicationInputSchema>;

export async function applyToAdopt(
  tx: Executor,
  params: { applicantUserId: string; listingId: string; input: ApplicationInput; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.applicantUserId);
  if (!(await getCertificate(tx, params.applicantUserId))) throw new DomainError('forbidden', 'animals.error.need_certificate');
  const [listing] = await tx.select().from(animalsListings).where(eq(animalsListings.id, params.listingId)).limit(1).for('update');
  if (!listing || listing.status === 'removed' || listing.status === 'withdrawn') throw errors.notFound('animals_listing');
  if (listing.status !== 'available') throw errors.conflict('animals.error.not_available');
  if (listing.rescuerUserId === params.applicantUserId) throw errors.validation('animals.error.own');
  const [open] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(animalsApplications)
    .where(and(eq(animalsApplications.applicantUserId, params.applicantUserId), inArray(animalsApplications.status, ['submitted', 'approved'])));
  if ((open?.count ?? 0) >= R.maxOpenApplicationsPerMember) throw errors.conflict('animals.error.too_many_applications', { limit: R.maxOpenApplicationsPerMember });

  const inserted = await tx
    .insert(animalsApplications)
    .values({ listingId: listing.id, applicantUserId: params.applicantUserId, answers: params.input.answers as ApplicationAnswers, commitments: params.input.commitments })
    .onConflictDoNothing()
    .returning({ id: animalsApplications.id });
  if (inserted.length === 0) throw errors.conflict('animals.error.already_applied');
  const id = inserted[0]!.id;
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.applicantUserId,
    action: 'animals.application_submitted',
    subjectType: LISTING,
    subjectId: listing.id,
    district: 'animals',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { applicationId: id },
  });
  await notify(tx, [
    { userId: listing.rescuerUserId, category: 'animals', type: 'animals.application', titleKey: 'notify.animals.application', params: { name: listing.name }, href: `/animals/${listing.id}#applications`, dedupeKey: `animals.application:${id}`, subjectId: listing.id },
  ]);
  return id;
}

async function lockApplicationForRescuer(tx: Executor, applicationId: string, rescuerUserId: string) {
  const [row] = await tx
    .select({ application: animalsApplications, listing: animalsListings })
    .from(animalsApplications)
    .innerJoin(animalsListings, eq(animalsListings.id, animalsApplications.listingId))
    .where(eq(animalsApplications.id, applicationId))
    .limit(1)
    .for('update');
  if (!row || row.listing.rescuerUserId !== rescuerUserId) throw errors.notFound('animals_application');
  return row;
}

export const APPLICATION_DECISIONS = ['approve', 'reject'] as const;
export type ApplicationDecision = (typeof APPLICATION_DECISIONS)[number];

/**
 * The rescuer chooses a home (the animal is reserved) or declines one, with
 * a reason the applicant will read. Declining the chosen home puts the
 * animal back up for adoption.
 */
export async function decideApplication(
  tx: Executor,
  params: { rescuerUserId: string; applicationId: string; decision: ApplicationDecision; note: string | null },
): Promise<void> {
  await activeMember(tx, params.rescuerUserId);
  const { application, listing } = await lockApplicationForRescuer(tx, params.applicationId, params.rescuerUserId);
  const note = params.note?.replace(/\s+/g, ' ').trim().slice(0, R.notesMaxLength) || null;
  if (params.decision === 'approve') {
    if (application.status !== 'submitted') throw errors.conflict('animals.error.not_submitted');
    if (listing.status !== 'available') throw errors.conflict('animals.error.not_available');
    await tx.update(animalsApplications).set({ status: 'approved', decisionNote: note, decidedAt: new Date() }).where(eq(animalsApplications.id, application.id));
    await tx.update(animalsListings).set({ status: 'reserved', updatedAt: new Date() }).where(eq(animalsListings.id, listing.id));
  } else {
    if (application.status !== 'submitted' && application.status !== 'approved') throw errors.conflict('animals.error.not_submitted');
    if (!note) throw errors.validation('animals.error.decision_note');
    await tx.update(animalsApplications).set({ status: 'rejected', decisionNote: note, decidedAt: new Date() }).where(eq(animalsApplications.id, application.id));
    if (application.status === 'approved') {
      await tx.update(animalsListings).set({ status: 'available', updatedAt: new Date() }).where(eq(animalsListings.id, listing.id));
    }
  }
  const outcome = params.decision === 'approve' ? 'approved' : 'rejected';
  await recordAudit(tx, { actorType: 'user', actorUserId: params.rescuerUserId, action: `animals.application_${outcome}`, subjectType: LISTING, subjectId: listing.id, district: 'animals', metadata: { applicationId: application.id } });
  await notify(tx, [
    { userId: application.applicantUserId, category: 'animals', type: `animals.application_${outcome}`, titleKey: `notify.animals.application_${outcome}`, params: { name: listing.name }, href: `/animals/${listing.id}`, dedupeKey: `animals.decision:${application.id}:${outcome}`, subjectId: listing.id },
  ]);
}

/**
 * The animal went home. Only the rescuer can say so, only for the home they
 * chose. The adopter earns `approved_animal_adoption`, once; everyone else
 * who applied is told the animal found a home.
 */
export async function completeAdoption(tx: Executor, params: { rescuerUserId: string; applicationId: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const { application, listing } = await lockApplicationForRescuer(tx, params.applicationId, params.rescuerUserId);
  if (application.status !== 'approved') throw errors.conflict('animals.error.not_approved_application');
  await tx.update(animalsApplications).set({ status: 'completed', completedAt: now }).where(eq(animalsApplications.id, application.id));
  await tx.update(animalsListings).set({ status: 'adopted', adoptedBy: application.applicantUserId, updatedAt: now }).where(eq(animalsListings.id, listing.id));
  const others = await tx
    .update(animalsApplications)
    .set({ status: 'rejected', decisionNote: null, decidedAt: now })
    .where(and(eq(animalsApplications.listingId, listing.id), eq(animalsApplications.status, 'submitted')))
    .returning({ applicantUserId: animalsApplications.applicantUserId });
  await applyRule(tx, { userId: application.applicantUserId, ruleKey: 'approved_animal_adoption', source: 'animals', idempotencyKey: `animals.adoption:${application.id}` });
  await recordAudit(tx, { actorType: 'user', actorUserId: params.rescuerUserId, action: 'animals.adoption_completed', subjectType: LISTING, subjectId: listing.id, district: 'animals', metadata: { applicationId: application.id, adopter: application.applicantUserId } });
  await notify(tx, [
    { userId: application.applicantUserId, category: 'animals', type: 'animals.adopted', titleKey: 'notify.animals.adopted', params: { name: listing.name }, href: `/animals/${listing.id}`, dedupeKey: `animals.adopted:${application.id}`, subjectId: listing.id },
    ...others.map((row) => ({ userId: row.applicantUserId, category: 'animals' as const, type: 'animals.listing_closed', titleKey: 'notify.animals.found_home', params: { name: listing.name }, href: '/animals', subjectId: listing.id })),
  ]);
}

export async function withdrawApplication(tx: Executor, params: { applicantUserId: string; applicationId: string }): Promise<void> {
  const [row] = await tx
    .select({ application: animalsApplications, listing: animalsListings })
    .from(animalsApplications)
    .innerJoin(animalsListings, eq(animalsListings.id, animalsApplications.listingId))
    .where(eq(animalsApplications.id, params.applicationId))
    .limit(1)
    .for('update');
  if (!row || row.application.applicantUserId !== params.applicantUserId) throw errors.notFound('animals_application');
  if (row.application.status !== 'submitted' && row.application.status !== 'approved') throw errors.conflict('animals.error.not_submitted');
  await tx.update(animalsApplications).set({ status: 'withdrawn', decidedAt: new Date() }).where(eq(animalsApplications.id, row.application.id));
  if (row.application.status === 'approved') {
    await tx.update(animalsListings).set({ status: 'available', updatedAt: new Date() }).where(eq(animalsListings.id, row.listing.id));
    await notify(tx, [{ userId: row.listing.rescuerUserId, category: 'animals', type: 'animals.application_withdrawn', titleKey: 'notify.animals.application_withdrawn', params: { name: row.listing.name }, href: `/animals/${row.listing.id}#applications` }]);
  }
  await recordAudit(tx, { actorType: 'user', actorUserId: params.applicantUserId, action: 'animals.application_withdrawn', subjectType: LISTING, subjectId: row.listing.id, district: 'animals', metadata: { applicationId: row.application.id } });
}

/**
 * Scheduler job: `followUpDays` after an adoption, the adopter is asked to
 * send the rescuer news, and the rescuer is reminded to ask. Once each.
 */
export async function sendAdoptionFollowUps(database: Database, now = new Date()): Promise<{ sent: number }> {
  const due = await database
    .select({ id: animalsApplications.id, applicantUserId: animalsApplications.applicantUserId, listingId: animalsListings.id, name: animalsListings.name, rescuerUserId: animalsListings.rescuerUserId })
    .from(animalsApplications)
    .innerJoin(animalsListings, eq(animalsListings.id, animalsApplications.listingId))
    .where(and(eq(animalsApplications.status, 'completed'), sql`${animalsApplications.followUpSentAt} is null`, lte(animalsApplications.completedAt, new Date(now.getTime() - R.followUpDays * 86_400_000))))
    .limit(500);
  let sent = 0;
  for (const row of due) {
    await database.transaction(async (tx) => {
      const [claimed] = await tx
        .update(animalsApplications)
        .set({ followUpSentAt: now })
        .where(and(eq(animalsApplications.id, row.id), sql`${animalsApplications.followUpSentAt} is null`))
        .returning({ id: animalsApplications.id });
      if (!claimed) return;
      await notify(tx, [
        { userId: row.applicantUserId, category: 'animals', type: 'animals.follow_up', titleKey: 'notify.animals.follow_up_adopter', params: { name: row.name }, href: `/animals/${row.listingId}`, dedupeKey: `animals.follow_up:${row.id}:adopter` },
        { userId: row.rescuerUserId, category: 'animals', type: 'animals.follow_up', titleKey: 'notify.animals.follow_up_rescuer', params: { name: row.name }, href: `/animals/${row.listingId}#applications`, dedupeKey: `animals.follow_up:${row.id}:rescuer` },
      ]);
      sent += 1;
    });
  }
  return { sent };
}

// --- Reports -----------------------------------------------------------------

export async function reportAnimal(
  tx: Executor,
  params: { reporterUserId: string; listingId: string; category: AnimalsReportCategory; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const [listing] = await tx.select({ rescuerUserId: animalsListings.rescuerUserId, status: animalsListings.status }).from(animalsListings).where(eq(animalsListings.id, params.listingId)).limit(1);
  if (!listing || listing.status === 'removed') throw errors.notFound('animals_listing');
  if (listing.rescuerUserId === params.reporterUserId) throw errors.validation('animals.report.error.own');
  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, LISTING), eq(reports.subjectId, params.listingId), eq(reports.reporterUserId, params.reporterUserId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };
  const priority = params.category === 'animal_abuse' || params.category === 'scam' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: LISTING, subjectId: params.listingId, category: params.category, priority });
  await tx.insert(reports).values({ reporterUserId: params.reporterUserId, subjectType: LISTING, subjectId: params.listingId, district: 'animals', category: params.category, description: params.description, evidence: [], ticketId });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.reporterUserId, action: 'animals.listing_reported', subjectType: LISTING, subjectId: params.listingId, district: 'animals', metadata: { category: params.category, ticketId } });
  return { ticketCode: ticket!.code, duplicate: false };
}

export const ANIMALS_TICKET_DECISIONS = ['dismiss', 'remove_listing', 'suspend_rescuer'] as const;
export type AnimalsTicketDecision = (typeof ANIMALS_TICKET_DECISIONS)[number];

export async function resolveAnimalsTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: AnimalsTicketDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'adoptions.review');
  const [ticket] = await tx.select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status }).from(tickets).where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, LISTING))).limit(1).for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  if (params.decision !== 'dismiss' && !params.note) throw errors.validation('animals.error.review_note');
  const [listing] = await tx.select().from(animalsListings).where(eq(animalsListings.id, ticket.subjectId)).limit(1).for('update');
  if (!listing) throw errors.notFound('animals_listing');
  if (listing.rescuerUserId === actor.userId) throw errors.forbidden('adoptions.review');
  if (params.decision !== 'dismiss') {
    await tx.update(animalsListings).set({ status: 'removed', removedBy: actor.userId, updatedAt: new Date() }).where(eq(animalsListings.id, listing.id));
    const photos = await tx.select({ mediaId: animalsListingPhotos.mediaId }).from(animalsListingPhotos).where(eq(animalsListingPhotos.listingId, listing.id));
    await markRemoved(tx, photos.map((photo) => photo.mediaId));
  }
  if (params.decision === 'suspend_rescuer') {
    await tx.update(animalsRescuers).set({ status: 'suspended', reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(animalsRescuers.userId, listing.rescuerUserId));
    await tx.update(animalsListings).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(animalsListings.rescuerUserId, listing.rescuerUserId), eq(animalsListings.status, 'available')));
  }
  if (params.decision !== 'dismiss') {
    await notify(tx, [{ userId: listing.rescuerUserId, category: 'moderation', type: `animals.${params.decision}`, titleKey: params.decision === 'suspend_rescuer' ? 'notify.animals.rescuer_suspended' : 'notify.animals.listing_removed', params: { name: listing.name }, href: '/animals/rescuer' }]);
  }
  const actedOn = params.decision !== 'dismiss';
  await tx
    .update(tickets)
    .set({ status: actedOn ? 'resolved' : 'rejected', resolutionSummary: actedOn ? 'moderation.resolution.removed' : 'moderation.resolution.no_action', assignedTo: actor.userId, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(tickets.id, ticket.id));
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `animals_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `moderation.animals_${params.decision}`, subjectType: LISTING, subjectId: listing.id, district: 'animals', metadata: { ticketId: ticket.id } });
}

// --- Reading -----------------------------------------------------------------

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

export type AnimalCard = {
  id: string;
  species: string;
  name: string;
  sex: string;
  size: string;
  ageMonths: number | null;
  sterilised: boolean;
  vaccinated: boolean;
  status: string;
  placeName: string;
  photoId: string | null;
  rescuerName: string;
};

const cardColumns = {
  id: animalsListings.id,
  species: animalsListings.species,
  name: animalsListings.name,
  sex: animalsListings.sex,
  size: animalsListings.size,
  ageMonths: animalsListings.ageMonths,
  sterilised: animalsListings.sterilised,
  vaccinated: animalsListings.vaccinated,
  status: animalsListings.status,
  placeName: locations.name,
  placeNames: locations.names,
  rescuerName: animalsRescuers.name,
  photoId: sql<string | null>`(select p.media_id from animals_listing_photos p join media m on m.id = p.media_id and m.status = 'active' where p.listing_id = ${animalsListings.id} order by p.position limit 1)`,
};

type CardRow = { id: string; species: string; name: string; sex: string; size: string; ageMonths: number | null; sterilised: boolean; vaccinated: boolean; status: string; placeName: string; placeNames: unknown; rescuerName: string; photoId: string | null };

function toCard(row: CardRow, locale: string): AnimalCard {
  return { ...row, placeName: localized(row.placeName, row.placeNames, locale) };
}

/** Animals looking for a home. Public: the more people see them, the sooner they go home. */
export async function listAnimals(
  executor: Executor,
  params: { locale: string; species?: string; size?: string; placeCode?: string; page?: number },
): Promise<{ items: AnimalCard[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const conditions = [eq(animalsListings.status, 'available'), eq(animalsRescuers.status, 'approved')];
  if (params.species && (SPECIES as readonly string[]).includes(params.species)) conditions.push(eq(animalsListings.species, params.species));
  if (params.size && (SIZES as readonly string[]).includes(params.size)) conditions.push(eq(animalsListings.size, params.size));
  if (params.placeCode) conditions.push(sql`(${locations.code} = ${params.placeCode} or ${params.placeCode} = any(${locations.path}))`);
  const rows = await executor
    .select(cardColumns)
    .from(animalsListings)
    .innerJoin(animalsRescuers, eq(animalsRescuers.userId, animalsListings.rescuerUserId))
    .innerJoin(locations, eq(locations.id, animalsListings.locationId))
    .where(and(...conditions))
    .orderBy(desc(animalsListings.createdAt))
    .limit(R.pageSize + 1)
    .offset((page - 1) * R.pageSize);
  return { items: rows.slice(0, R.pageSize).map((row) => toCard(row as CardRow, params.locale)), hasMore: rows.length > R.pageSize, page };
}

export type ApplicationView = {
  id: string;
  status: string;
  answers: ApplicationAnswers;
  decisionNote: string | null;
  createdAt: Date;
  applicant: { userId: string; displayName: string; yayId: string; whatsappE164: string | null };
};

export async function getAnimal(executor: Executor, params: { listingId: string; viewerId: string | null; viewerIsReviewer: boolean; locale: string }) {
  const [row] = await executor
    .select({
      ...cardColumns,
      rescuerUserId: animalsListings.rescuerUserId,
      dewormed: animalsListings.dewormed,
      healthNotes: animalsListings.healthNotes,
      temperament: animalsListings.temperament,
      description: animalsListings.description,
      createdAt: animalsListings.createdAt,
      rescuerKind: animalsRescuers.kind,
      rescuerStatus: animalsRescuers.status,
      rescuerWhatsapp: animalsRescuers.whatsappE164,
      adoptedBy: animalsListings.adoptedBy,
    })
    .from(animalsListings)
    .innerJoin(animalsRescuers, eq(animalsRescuers.userId, animalsListings.rescuerUserId))
    .innerJoin(locations, eq(locations.id, animalsListings.locationId))
    .where(eq(animalsListings.id, params.listingId))
    .limit(1);
  if (!row) return null;
  const isRescuer = row.rescuerUserId === params.viewerId;
  const isAdopter = row.adoptedBy !== null && row.adoptedBy === params.viewerId;
  const hidden = row.status === 'removed' || row.status === 'withdrawn' || row.rescuerStatus !== 'approved';
  if (hidden && !isRescuer && !params.viewerIsReviewer) return null;

  const photos = await executor
    .select({ id: animalsListingPhotos.mediaId })
    .from(animalsListingPhotos)
    .where(eq(animalsListingPhotos.listingId, row.id))
    .orderBy(asc(animalsListingPhotos.position));

  let applications: ApplicationView[] = [];
  if (isRescuer) {
    const rows = await executor
      .select({ app: animalsApplications, displayName: users.displayName, yayDigits: users.yayId })
      .from(animalsApplications)
      .innerJoin(users, eq(users.id, animalsApplications.applicantUserId))
      .where(and(eq(animalsApplications.listingId, row.id), ne(animalsApplications.status, 'withdrawn')))
      .orderBy(asc(animalsApplications.createdAt));
    applications = rows.map((r) => ({
      id: r.app.id,
      status: r.app.status,
      answers: r.app.answers,
      decisionNote: r.app.decisionNote,
      createdAt: r.app.createdAt,
      applicant: { userId: r.app.applicantUserId, displayName: r.displayName, yayId: formatYayId(r.yayDigits), whatsappE164: null },
    }));
  }
  const [mine] = params.viewerId
    ? await executor
        .select({ id: animalsApplications.id, status: animalsApplications.status, decisionNote: animalsApplications.decisionNote })
        .from(animalsApplications)
        .where(and(eq(animalsApplications.listingId, row.id), eq(animalsApplications.applicantUserId, params.viewerId)))
        .limit(1)
    : [];
  return {
    animal: { ...toCard(row as CardRow, params.locale), dewormed: row.dewormed, healthNotes: row.healthNotes, temperament: row.temperament, description: row.description, createdAt: row.createdAt, rescuerKind: row.rescuerKind },
    photos: photos.map((photo) => photo.id),
    isRescuer,
    applications,
    myApplication: mine ?? null,
    // The rescuer's WhatsApp is for the home they chose, and for the adopter afterwards.
    rescuerWhatsapp: mine && (mine.status === 'approved' || mine.status === 'completed') ? row.rescuerWhatsapp : isAdopter ? row.rescuerWhatsapp : null,
  };
}

export async function getRescuer(executor: Executor, userId: string) {
  const [row] = await executor.select().from(animalsRescuers).where(eq(animalsRescuers.userId, userId)).limit(1);
  return row ?? null;
}

export async function rescuerListings(executor: Executor, params: { userId: string; locale: string }) {
  const rows = await executor
    .select({ ...cardColumns, applications: sql<number>`(select count(*)::int from animals_applications a where a.listing_id = ${animalsListings.id} and a.status = 'submitted')` })
    .from(animalsListings)
    .innerJoin(animalsRescuers, eq(animalsRescuers.userId, animalsListings.rescuerUserId))
    .innerJoin(locations, eq(locations.id, animalsListings.locationId))
    .where(and(eq(animalsListings.rescuerUserId, params.userId), ne(animalsListings.status, 'removed')))
    .orderBy(desc(animalsListings.createdAt))
    .limit(100);
  return rows.map((row) => ({ ...toCard(row as CardRow, params.locale), pending: row.applications }));
}

export async function myApplications(executor: Executor, params: { userId: string; locale: string }) {
  const rows = await executor
    .select({ ...cardColumns, applicationId: animalsApplications.id, applicationStatus: animalsApplications.status, decisionNote: animalsApplications.decisionNote })
    .from(animalsApplications)
    .innerJoin(animalsListings, eq(animalsListings.id, animalsApplications.listingId))
    .innerJoin(animalsRescuers, eq(animalsRescuers.userId, animalsListings.rescuerUserId))
    .innerJoin(locations, eq(locations.id, animalsListings.locationId))
    .where(eq(animalsApplications.applicantUserId, params.userId))
    .orderBy(desc(animalsApplications.createdAt))
    .limit(50);
  return rows.map((row) => ({ ...toCard(row as CardRow, params.locale), applicationId: row.applicationId, applicationStatus: row.applicationStatus, decisionNote: row.decisionNote }));
}

/** Rescuers waiting for review, and open reports. `adoptions.review` only. */
export async function animalsReviewQueue(executor: Executor, actor: AuthContext | null, locale: string) {
  await requirePermission(executor, actor, 'adoptions.review');
  const pending = await executor
    .select({ rescuer: animalsRescuers, displayName: users.displayName, yayDigits: users.yayId, email: users.email, placeName: locations.name, placeNames: locations.names })
    .from(animalsRescuers)
    .innerJoin(users, eq(users.id, animalsRescuers.userId))
    .innerJoin(locations, eq(locations.id, animalsRescuers.locationId))
    .where(eq(animalsRescuers.status, 'pending'))
    .orderBy(asc(animalsRescuers.updatedAt))
    .limit(100);
  const open = await executor
    .select({ ticketId: tickets.id, code: tickets.code, priority: tickets.priority, listingId: animalsListings.id, name: animalsListings.name, rescuerName: animalsRescuers.name })
    .from(tickets)
    .innerJoin(animalsListings, sql`${animalsListings.id}::text = ${tickets.subjectId}`)
    .innerJoin(animalsRescuers, eq(animalsRescuers.userId, animalsListings.rescuerUserId))
    .where(and(eq(tickets.subjectType, LISTING), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = open.map((t) => t.ticketId);
  const reported = ids.length ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description }).from(reports).where(inArray(reports.ticketId, ids)) : [];
  return {
    rescuers: pending.map((row) => ({
      userId: row.rescuer.userId,
      kind: row.rescuer.kind,
      name: row.rescuer.name,
      about: row.rescuer.about,
      whatsappE164: row.rescuer.whatsappE164,
      placeName: localized(row.placeName, row.placeNames, locale),
      member: { displayName: row.displayName, yayId: formatYayId(row.yayDigits), email: row.email },
      createdAt: row.rescuer.createdAt,
    })),
    reports: open.map((ticket) => ({ ...ticket, reports: reported.filter((r) => r.ticketId === ticket.ticketId) })),
  };
}
