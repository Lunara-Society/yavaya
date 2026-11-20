'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { signInPath } from '@/server/auth/sign-in-path';
import { isDomainError } from '@/server/errors';
import { miradorOpen } from '@/server/domains/mirador/access';
import { applyAsOrganisation, organisationInputSchema, ORGANISATION_DECISIONS, reviewOrganisation, type OrganisationDecision } from '@/server/domains/aid/service';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const back = (key: string) => `/mirador/organizacion?error=${encodeURIComponent(key)}`;

/** A food bank, soup kitchen or shelter applies, or changes what was reviewed (docs/mirador/README.md, "Offers"). */
export async function organisationAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  if (!(await miradorOpen(db(), session.user.userId))) redirect('/');
  const parsed = organisationInputSchema.safeParse({
    kind: field(formData, 'kind'),
    name: field(formData, 'name'),
    about: field(formData, 'about'),
    registration: field(formData, 'registration'),
    locationId: field(formData, 'locationId'),
    whatsapp: field(formData, 'whatsapp'),
  });
  if (!parsed.success) redirect(back(parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  try {
    await db().transaction((tx) => applyAsOrganisation(tx, { userId: session.user.userId, input: parsed.data }));
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(back(error.messageKey));
    throw error;
  }
  redirect('/mirador/organizacion?saved=1');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reviewer approves, rejects or suspends an organisation (`causes.review`, checked in the service). */
export async function reviewOrganisationAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const organisationUserId = field(formData, 'organisationUserId');
  const decision = field(formData, 'decision');
  if (!UUID.test(organisationUserId) || !(ORGANISATION_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/organizaciones');
  try {
    await db().transaction((tx) =>
      reviewOrganisation(tx, { actor: { userId: session.user.userId, status: session.user.status }, organisationUserId, decision: decision as OrganisationDecision, note: field(formData, 'note').slice(0, 1000) || null }),
    );
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`/admin/organizaciones?error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  redirect('/admin/organizaciones?done=1');
}
