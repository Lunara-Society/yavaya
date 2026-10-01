'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  apply,
  applicationMessageSchema,
  APPLICATION_STEPS,
  closePost,
  decideApplication,
  EMPLOYER_DECISIONS,
  employerInputSchema,
  reviewEmployer,
  saveEmployer,
  type EmployerDecision,
  postInputSchema,
  profileInputSchema,
  publishPost,
  reportWork,
  resolveWorkTicket,
  saveProfile,
  withdrawApplication,
  WORK_REPORT_CATEGORIES,
  WORK_TICKET_DECISIONS,
  type ApplicationStep,
  type WorkReportCategory,
  type WorkTicketDecision,
} from '@/server/domains/work/service';

/** Trabajo's mutations: plain forms that work on any phone, without JavaScript. */

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

export async function saveProfileAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const years = field(formData, 'experienceYears').trim();
  const parsed = profileInputSchema.safeParse({
    headline: field(formData, 'headline'),
    about: field(formData, 'about'),
    fields: formData.getAll('fields').map(String),
    skills: field(formData, 'skills'),
    experienceYears: years === '' ? null : Number.parseInt(years, 10),
    portfolioLinks: formData.getAll('portfolioLinks').map(String),
    locationId: field(formData, 'locationId'),
    whatsapp: field(formData, 'whatsapp'),
    openToWork: formData.get('openToWork') === 'on',
  });
  if (!parsed.success) redirect(back('/work/profile', parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => saveProfile(tx, { userId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back('/work/profile', errorKey(error)));
  }
  const next = field(formData, 'next');
  redirect(UUID.test(next) ? `/work/posts/${next}#apply` : '/work/profile?saved=1');
}

export async function publishPostAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const parsed = postInputSchema.safeParse({
    kind: field(formData, 'kind'),
    employment: field(formData, 'employment'),
    field: field(formData, 'field'),
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    requirements: field(formData, 'requirements'),
    payText: field(formData, 'payText'),
    locationId: field(formData, 'locationId'),
    placeMode: field(formData, 'placeMode'),
    whatsapp: field(formData, 'whatsapp'),
    noFeePromise: formData.get('noFeePromise') === 'on',
  });
  const form = `/work/posts/new?kind=${field(formData, 'kind') === 'project' ? 'project' : 'job'}`;
  if (!parsed.success) redirect(back(form, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const monitored = session.user.monitoredUntil > new Date();
  const limit = await consumeRateLimit(db(), monitored ? RATE_LIMITS.publishMonitored : RATE_LIMITS.publishStandard, `work:${session.user.userId}`);
  if (!limit.allowed) redirect(back(form, 'work.error.rate_limited'));
  let id: string;
  try {
    const audit = await auditContext();
    id = await db().transaction((tx) => publishPost(tx, { employerUserId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back(form, errorKey(error)));
  }
  revalidatePath('/work');
  redirect(`/work/posts/${id}?published=1`);
}

export async function applyAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const postId = field(formData, 'postId');
  if (!UUID.test(postId)) redirect('/work');
  const page = `/work/posts/${postId}`;
  const message = applicationMessageSchema.safeParse(field(formData, 'message'));
  if (!message.success) redirect(back(page, message.error.issues[0]?.message ?? 'error.validation_failed'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `work:${session.user.userId}`);
  if (!limit.allowed) redirect(back(page, 'work.error.rate_limited'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => apply(tx, { candidateUserId: session.user.userId, postId, message: message.data, audit }));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(`${page}?applied=1`);
}

export async function applicationStepAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const postId = field(formData, 'postId');
  const applicationId = field(formData, 'applicationId');
  if (!UUID.test(postId) || !UUID.test(applicationId)) redirect('/work');
  const page = `/work/posts/${postId}`;
  const step = field(formData, 'step');
  try {
    if ((APPLICATION_STEPS as readonly string[]).includes(step)) {
      await db().transaction((tx) => decideApplication(tx, { employerUserId: session.user.userId, applicationId, step: step as ApplicationStep, note: field(formData, 'note') || null }));
    } else if (step === 'withdraw') {
      await db().transaction((tx) => withdrawApplication(tx, { candidateUserId: session.user.userId, applicationId }));
    }
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(page);
}

export async function closePostAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const postId = field(formData, 'postId');
  if (!UUID.test(postId)) redirect('/work/mine');
  const outcome = field(formData, 'outcome') === 'filled' ? 'filled' : 'closed';
  try {
    await db().transaction((tx) => closePost(tx, { employerUserId: session.user.userId, postId, outcome }));
  } catch (error) {
    redirect(back(`/work/posts/${postId}`, errorKey(error)));
  }
  revalidatePath('/work');
  redirect(`/work/posts/${postId}`);
}

export async function reportWorkAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const subject = field(formData, 'subject') === 'profile' ? 'profile' : 'post';
  const subjectId = field(formData, 'subjectId');
  const from = field(formData, 'from');
  const page = from.startsWith('/work/') ? from : '/work';
  if (!UUID.test(subjectId)) redirect(page);
  const category = field(formData, 'category');
  if (!(WORK_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(back(page, 'work.report.error.category'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(back(page, 'work.error.rate_limited'));
  let code: string;
  try {
    ({ ticketCode: code } = await db().transaction((tx) =>
      reportWork(tx, { reporterUserId: session.user.userId, subject, subjectId, category: category as WorkReportCategory, description: field(formData, 'description').trim().slice(0, 1000) || null }),
    ));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  redirect(`${page}${page.includes('?') ? '&' : '?'}reported=${encodeURIComponent(code)}`);
}

export async function resolveWorkReportAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const ticketId = field(formData, 'ticketId');
  const decision = field(formData, 'decision');
  if (!UUID.test(ticketId) || !(WORK_TICKET_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/work');
  try {
    await db().transaction((tx) =>
      resolveWorkTicket(tx, { actor: { userId: session.user.userId, status: session.user.status }, ticketId, decision: decision as WorkTicketDecision, note: field(formData, 'note').trim().slice(0, 1000) || null }),
    );
  } catch (error) {
    redirect(back('/admin/work', errorKey(error)));
  }
  revalidatePath('/admin/work');
  redirect('/admin/work?done=1');
}

export async function saveEmployerAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const parsed = employerInputSchema.safeParse({
    kind: field(formData, 'kind'),
    name: field(formData, 'name'),
    registration: field(formData, 'registration'),
    about: field(formData, 'about'),
    website: field(formData, 'website'),
    locationId: field(formData, 'locationId'),
    whatsapp: field(formData, 'whatsapp'),
  });
  if (!parsed.success) redirect(back('/work/employer', parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  let reReview = false;
  try {
    const audit = await auditContext();
    ({ reReview } = await db().transaction((tx) => saveEmployer(tx, { userId: session.user.userId, input: parsed.data, audit })));
  } catch (error) {
    redirect(back('/work/employer', errorKey(error)));
  }
  redirect(`/work/employer?saved=${reReview ? 'review' : '1'}`);
}

export async function reviewEmployerAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const employerUserId = field(formData, 'employerUserId');
  const decision = field(formData, 'decision');
  if (!UUID.test(employerUserId) || !(EMPLOYER_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/work');
  try {
    await db().transaction((tx) =>
      reviewEmployer(tx, { actor: { userId: session.user.userId, status: session.user.status }, employerUserId, decision: decision as EmployerDecision, note: field(formData, 'note').trim().slice(0, 1000) || null }),
    );
  } catch (error) {
    redirect(back('/admin/work', errorKey(error)));
  }
  revalidatePath('/admin/work');
  redirect('/admin/work?done=1#employers');
}
