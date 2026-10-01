'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { QUIZ } from '@/config/animals';
import {
  ANIMALS_REPORT_CATEGORIES,
  ANIMALS_TICKET_DECISIONS,
  APPLICATION_DECISIONS,
  applicationInputSchema,
  applyAsRescuer,
  applyToAdopt,
  completeAdoption,
  decideApplication,
  reportAnimal,
  rescuerInputSchema,
  RESCUER_DECISIONS,
  resolveAnimalsTicket,
  reviewRescuer,
  submitQuiz,
  withdrawAnimal,
  withdrawApplication,
  type AnimalsReportCategory,
  type AnimalsTicketDecision,
  type ApplicationDecision,
  type RescuerDecision,
} from '@/server/domains/animals/service';

/** Animales' mutations: plain forms that work on any phone, without JavaScript. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function auditContext() {
  const context = await requestContext();
  return { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
}

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

const back = (path: string, key: string) => `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(key)}`;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return session;
}

export async function quizAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const answers = QUIZ.map((question) => {
    const value = Number.parseInt(field(formData, `q${question.id}`), 10);
    return Number.isInteger(value) ? value : null;
  });
  let result;
  try {
    result = await db().transaction((tx) => submitQuiz(tx, { userId: session.user.userId, answers }));
  } catch (error) {
    redirect(back('/animals/learn', errorKey(error)));
  }
  const next = field(formData, 'next');
  const search = new URLSearchParams({ score: String(result.score), wrong: result.wrong.join(',') });
  if (result.passed && UUID.test(next)) search.set('next', next);
  redirect(`/animals/learn?${search.toString()}#result`);
}

export async function rescuerAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const parsed = rescuerInputSchema.safeParse({
    kind: field(formData, 'kind'),
    name: field(formData, 'name'),
    about: field(formData, 'about'),
    locationId: field(formData, 'locationId'),
    whatsapp: field(formData, 'whatsapp'),
  });
  if (!parsed.success) redirect(back('/animals/rescuer', parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => applyAsRescuer(tx, { userId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back('/animals/rescuer', errorKey(error)));
  }
  redirect('/animals/rescuer?saved=1');
}

export async function applyAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const listingId = field(formData, 'listingId');
  if (!UUID.test(listingId)) redirect('/animals');
  const form = `/animals/${listingId}/apply`;
  const parsed = applicationInputSchema.safeParse({
    answers: {
      homeType: field(formData, 'homeType'),
      tenure: field(formData, 'tenure'),
      landlordAllows: field(formData, 'landlordAllows'),
      fencedYard: field(formData, 'fencedYard'),
      household: field(formData, 'household'),
      allAgree: formData.get('allAgree') === 'on',
      otherAnimals: field(formData, 'otherAnimals'),
      otherAnimalsSterilised: field(formData, 'otherAnimalsSterilised'),
      experience: field(formData, 'experience'),
      hoursAlone: Number.parseInt(field(formData, 'hoursAlone'), 10),
      sleepsWhere: field(formData, 'sleepsWhere'),
      vetPlan: field(formData, 'vetPlan'),
      whyAdopt: field(formData, 'whyAdopt'),
    },
    commitments: formData.getAll('commitments').map(String),
  });
  if (!parsed.success) redirect(back(form, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `animals:${session.user.userId}`);
  if (!limit.allowed) redirect(back(form, 'animals.error.rate_limited'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => applyToAdopt(tx, { applicantUserId: session.user.userId, listingId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back(form, errorKey(error)));
  }
  revalidatePath(`/animals/${listingId}`);
  redirect(`/animals/${listingId}?applied=1`);
}

export async function applicationStepAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const listingId = field(formData, 'listingId');
  const applicationId = field(formData, 'applicationId');
  if (!UUID.test(listingId) || !UUID.test(applicationId)) redirect('/animals');
  const page = `/animals/${listingId}`;
  const step = field(formData, 'step');
  try {
    if ((APPLICATION_DECISIONS as readonly string[]).includes(step)) {
      await db().transaction((tx) => decideApplication(tx, { rescuerUserId: session.user.userId, applicationId, decision: step as ApplicationDecision, note: field(formData, 'note') || null }));
    } else if (step === 'complete') {
      await db().transaction((tx) => completeAdoption(tx, { rescuerUserId: session.user.userId, applicationId }));
    } else if (step === 'withdraw') {
      await db().transaction((tx) => withdrawApplication(tx, { applicantUserId: session.user.userId, applicationId }));
    }
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(`${page}#applications`);
}

export async function withdrawAnimalAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const listingId = field(formData, 'listingId');
  if (!UUID.test(listingId)) redirect('/animals/rescuer');
  try {
    await db().transaction((tx) => withdrawAnimal(tx, { rescuerUserId: session.user.userId, listingId }));
  } catch (error) {
    redirect(back(`/animals/${listingId}`, errorKey(error)));
  }
  revalidatePath('/animals');
  redirect('/animals/rescuer');
}

export async function reportAnimalAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const listingId = field(formData, 'listingId');
  if (!UUID.test(listingId)) redirect('/animals');
  const page = `/animals/${listingId}`;
  const category = field(formData, 'category');
  if (!(ANIMALS_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(back(page, 'animals.report.error.category'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(back(page, 'animals.error.rate_limited'));
  let code: string;
  try {
    ({ ticketCode: code } = await db().transaction((tx) =>
      reportAnimal(tx, { reporterUserId: session.user.userId, listingId, category: category as AnimalsReportCategory, description: field(formData, 'description').trim().slice(0, 1000) || null }),
    ));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  redirect(`${page}?reported=${encodeURIComponent(code)}`);
}

export async function reviewRescuerAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const rescuerUserId = field(formData, 'rescuerUserId');
  const decision = field(formData, 'decision');
  if (!UUID.test(rescuerUserId) || !(RESCUER_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/animals');
  try {
    await db().transaction((tx) =>
      reviewRescuer(tx, { actor: { userId: session.user.userId, status: session.user.status }, rescuerUserId, decision: decision as RescuerDecision, note: field(formData, 'note').trim().slice(0, 1000) || null }),
    );
  } catch (error) {
    redirect(back('/admin/animals', errorKey(error)));
  }
  revalidatePath('/admin/animals');
  redirect('/admin/animals?done=1');
}

export async function resolveAnimalsReportAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const ticketId = field(formData, 'ticketId');
  const decision = field(formData, 'decision');
  if (!UUID.test(ticketId) || !(ANIMALS_TICKET_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/animals');
  try {
    await db().transaction((tx) =>
      resolveAnimalsTicket(tx, { actor: { userId: session.user.userId, status: session.user.status }, ticketId, decision: decision as AnimalsTicketDecision, note: field(formData, 'note').trim().slice(0, 1000) || null }),
    );
  } catch (error) {
    redirect(back('/admin/animals', errorKey(error)));
  }
  revalidatePath('/admin/animals');
  redirect('/admin/animals?done=1');
}
