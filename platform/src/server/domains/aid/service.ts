import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '@/server/db/client';
import { aidOrganisations, animalsRescuers, locations, sanctuaryChurches, users } from '@/server/db/schema';
import { MIRADOR_RULES as R } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { notify } from '@/server/domains/notifications/service';

/**
 * Who Yavaya has checked will really share (docs/mirador/README.md, "Offers").
 *
 * Three registries, each approved by a person, never by a form alone:
 * - Santuario's churches (`sanctuary.review`);
 * - Animales' rescuers (`adoptions.review`);
 * - food banks, soup kitchens and shelters that are not churches (here,
 *   `causes.review`), added on the owner's word of 20 November 2026.
 *
 * Food "for soup kitchens" may be asked for by an approved church or
 * organisation; things "for animals in need" by an approved rescuer; and any
 * of the three may ask the neighbourhood for help ("Pido ayuda").
 */

export const AID_KINDS = ['food_bank', 'soup_kitchen', 'shelter', 'other'] as const;
export type AidKind = (typeof AID_KINDS)[number];

const clean = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

export const organisationInputSchema = z.object({
  kind: z.enum(AID_KINDS, { message: 'aid.error.kind' }),
  name: clean(R.organisationNameMinLength, R.organisationNameMaxLength, 'aid.error.name'),
  about: clean(R.organisationAboutMinLength, R.organisationAboutMaxLength, 'aid.error.about'),
  registration: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(R.organisationRegistrationMaxLength, { message: 'aid.error.registration' }))
    .transform((value) => value || null),
  locationId: z.string().uuid({ message: 'aid.error.location' }),
  whatsapp: z.string().transform((value, ctx) => {
    const normalized = normalizeWhatsapp(value);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'aid.error.whatsapp' });
    return normalized ?? '';
  }),
});
export type OrganisationInput = z.output<typeof organisationInputSchema>;

/** Applying, or changing what was reviewed: who it is goes back to review; a new phone number does not. */
export async function applyAsOrganisation(tx: Executor, params: { userId: string; input: OrganisationInput }): Promise<void> {
  const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status !== 'active') throw new DomainError('forbidden', 'aid.error.account');
  const { input } = params;
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('aid.error.location');
  const [existing] = await tx.select().from(aidOrganisations).where(eq(aidOrganisations.userId, params.userId)).limit(1).for('update');
  if (existing?.status === 'suspended') throw new DomainError('forbidden', 'aid.error.suspended');
  const values = { kind: input.kind, name: input.name, about: input.about, registration: input.registration, locationId: input.locationId, whatsappE164: input.whatsapp, updatedAt: new Date() };
  const identityChanged = !existing || existing.kind !== input.kind || existing.name !== input.name || existing.about !== input.about || existing.registration !== input.registration || existing.locationId !== input.locationId;
  if (existing) {
    await tx
      .update(aidOrganisations)
      .set(identityChanged ? { ...values, status: 'pending', reviewNote: null, reviewedBy: null, reviewedAt: null } : values)
      .where(eq(aidOrganisations.userId, params.userId));
  } else {
    await tx.insert(aidOrganisations).values({ userId: params.userId, ...values });
  }
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: existing ? 'aid.organisation_updated' : 'aid.organisation_applied', subjectType: 'aid_organisation', subjectId: params.userId, metadata: { kind: input.kind, reReview: identityChanged } });
}

export const ORGANISATION_DECISIONS = ['approve', 'reject', 'suspend'] as const;
export type OrganisationDecision = (typeof ORGANISATION_DECISIONS)[number];

export async function reviewOrganisation(tx: Executor, params: { actor: AuthContext | null; organisationUserId: string; decision: OrganisationDecision; note: string | null }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'causes.review');
  if (actor.userId === params.organisationUserId) throw errors.forbidden('causes.review');
  const [row] = await tx.select().from(aidOrganisations).where(eq(aidOrganisations.userId, params.organisationUserId)).limit(1).for('update');
  if (!row) throw errors.notFound('aid_organisation');
  if (params.decision === 'suspend' && row.status !== 'approved') throw errors.conflict('aid.error.not_approved');
  if (params.decision !== 'suspend' && row.status !== 'pending') throw errors.conflict('aid.error.not_pending');
  const note = params.note?.trim() || null;
  if (params.decision !== 'approve' && !note) throw errors.validation('aid.error.review_note');
  const status = params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'suspended';
  await tx.update(aidOrganisations).set({ status, reviewNote: note, reviewedBy: actor.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(aidOrganisations.userId, row.userId));
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `aid.organisation_${status}`, subjectType: 'aid_organisation', subjectId: row.userId });
  await notify(tx, [{ userId: row.userId, category: 'mirador', type: `aid.organisation_${status}`, titleKey: `aid.notify.${status}`, params: { name: row.name }, href: '/mirador/organizacion' }]);
}

export async function myOrganisation(executor: Executor, userId: string) {
  const [row] = await executor.select().from(aidOrganisations).where(eq(aidOrganisations.userId, userId)).limit(1);
  return row ?? null;
}

/** For the reviewer: waiting ones first (oldest first), then the approved, which can be suspended. */
export async function organisationsToReview(executor: Executor) {
  return executor
    .select({ org: aidOrganisations, member: users.displayName, yayId: users.yayId, place: locations.name })
    .from(aidOrganisations)
    .innerJoin(users, eq(users.id, aidOrganisations.userId))
    .innerJoin(locations, eq(locations.id, aidOrganisations.locationId))
    .orderBy(asc(aidOrganisations.status), asc(aidOrganisations.createdAt))
    .limit(200);
}

export type HelperKind = 'church' | 'organisation' | 'rescuer';
export type Helper = { kind: HelperKind; name: string };

/** Every way this member is a checked helper, in the order a viewer would trust them most. */
export async function verifiedHelperRoles(executor: Executor, userId: string): Promise<Helper[]> {
  const [churches, organisations, rescuers] = await Promise.all([
    executor.select({ name: sanctuaryChurches.name }).from(sanctuaryChurches).where(and(eq(sanctuaryChurches.ownerUserId, userId), eq(sanctuaryChurches.status, 'approved'))).limit(1),
    executor.select({ name: aidOrganisations.name }).from(aidOrganisations).where(and(eq(aidOrganisations.userId, userId), eq(aidOrganisations.status, 'approved'))).limit(1),
    executor.select({ name: animalsRescuers.name }).from(animalsRescuers).where(and(eq(animalsRescuers.userId, userId), eq(animalsRescuers.status, 'approved'))).limit(1),
  ]);
  return [
    ...churches.map((row) => ({ kind: 'church' as const, name: row.name })),
    ...organisations.map((row) => ({ kind: 'organisation' as const, name: row.name })),
    ...rescuers.map((row) => ({ kind: 'rescuer' as const, name: row.name })),
  ];
}
