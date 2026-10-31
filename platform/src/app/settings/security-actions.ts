'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { getTranslator } from '@/i18n/server';
import { isLocale } from '@/i18n/config';
import type { MessageKey } from '@/i18n';
import { currentSession } from '@/server/auth/context';
import { revokeAllSessions } from '@/server/auth/session';
import { dropSetup, holdSetup, readSetup } from '@/server/auth/two-step-cookies';
import { disableTwoStep, enableTwoStep, newSecret, replaceRecoveryCodes, twoStepAvailable, verifySecondStep } from '@/server/domains/identity/two-step';
import { changePassword } from '@/server/domains/identity/password';
import { changeDisplayName } from '@/server/domains/identity/display-name';
import { passwordSchema } from '@/server/domains/identity/service';
import { recordAudit } from '@/server/domains/audit/service';
import { sendSecurityNotice, type SecurityNotice } from '@/server/domains/notifications/email/service';
import { isDomainError, toClientError } from '@/server/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { signInPath } from '@/server/auth/sign-in-path';

export type SecurityState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'done'; message: string } | { status: 'codes'; codes: string[] };

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  return session;
}

/** Emails the account's owner about the change, in their language. */
async function notify(userId: string, kind: SecurityNotice): Promise<void> {
  const [user] = await db().select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  if (user) await sendSecurityNotice({ to: user.email, locale: isLocale(user.locale) ? user.locale : 'es', kind });
}

/** A fresh secret for this member, held while they scan it. */
export async function startTwoStepAction(): Promise<void> {
  const session = await signedIn();
  if (!twoStepAvailable()) redirect('/settings#security');
  await holdSetup(session.user.userId, newSecret());
  redirect('/settings/dos-pasos');
}

export async function confirmTwoStepAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  const secret = await readSetup(session.user.userId);
  if (!secret) return { status: 'error', message: t('two_step.setup.expired') };
  try {
    const result = await db().transaction((tx) => enableTwoStep(tx, { userId: session.user.userId, secret, code: String(formData.get('code') ?? '') }));
    if (!result.ok) return { status: 'error', message: t('two_step.setup.mismatch') };
    await notify(session.user.userId, 'two_step_on');
    // Nothing here may re-render the page — no revalidation, and no cookie
    // change, which also refreshes it — or the "already on" view would replace
    // the backup codes, shown only now. The setup cookie goes when the member
    // says they have saved them (`savedCodesAction`).
    return { status: 'codes', codes: result.recoveryCodes };
  } catch (error) {
    const clientError = toClientError(error);
    return { status: 'error', message: t(clientError.messageKey as MessageKey) };
  }
}

/** "I've saved them": the setup secret is no longer needed anywhere. */
export async function savedCodesAction(): Promise<void> {
  await dropSetup();
  redirect('/settings#security');
}

/** Both of these need a code first: a borrowed, unlocked phone must not be enough. */
export async function newRecoveryCodesAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  const userId = session.user.userId;
  const outcome = await db().transaction(async (tx) => {
    const check = await verifySecondStep(tx, { userId, input: String(formData.get('code') ?? '').trim().slice(0, 40) });
    if (!check.ok) return check.reason;
    return replaceRecoveryCodes(tx, userId);
  });
  if (Array.isArray(outcome)) return { status: 'codes', codes: outcome };
  return { status: 'error', message: t(outcome === 'rate_limited' ? 'two_step.error.rate_limited' : 'two_step.error.mismatch') };
}

export async function disableTwoStepAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  const userId = session.user.userId;
  const outcome = await db().transaction(async (tx) => {
    const check = await verifySecondStep(tx, { userId, input: String(formData.get('code') ?? '').trim().slice(0, 40) });
    if (!check.ok) return check.reason;
    await disableTwoStep(tx, { userId, actorUserId: userId, by: 'member' });
    return 'off' as const;
  });
  if (outcome !== 'off') return { status: 'error', message: t(outcome === 'rate_limited' ? 'two_step.error.rate_limited' : 'two_step.error.mismatch') };
  await notify(userId, 'two_step_off');
  revalidatePath('/settings');
  return { status: 'done', message: t('two_step.manage.off_done') };
}

export async function changePasswordAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.passwordChange, `user:${session.user.userId}`);
  if (!limit.allowed) return { status: 'error', message: t('error.rate_limited', { retryAfterSeconds: limit.retryAfterSeconds }) };
  const parsed = passwordSchema.safeParse(String(formData.get('next') ?? ''));
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message;
    return { status: 'error', message: t((key?.startsWith('error.') ? key : 'error.validation_failed') as MessageKey) };
  }
  const result = await db().transaction((tx) =>
    changePassword(tx, { userId: session.user.userId, current: String(formData.get('current') ?? ''), next: parsed.data, keepSessionId: session.sessionId }),
  );
  if (!result.ok) return { status: 'error', message: t('settings.password.wrong') };
  await sendSecurityNotice({ to: result.email, locale: isLocale(result.locale) ? result.locale : 'es', kind: 'password_changed' });
  return { status: 'done', message: t('settings.password.done') };
}

/** Changes the display name: the first change free, each one after for a token. */
export async function changeNameAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  try {
    const result = await db().transaction((tx) => changeDisplayName(tx, { userId: session.user.userId, name: String(formData.get('name') ?? '') }));
    revalidatePath('/', 'layout');
    return { status: 'done', message: t('settings.name.done', { name: result.displayName }) };
  } catch (error) {
    if (!isDomainError(error)) throw error;
    if (error.code === 'insufficient_tokens') return { status: 'error', message: t('settings.name.no_tokens') };
    if (error.messageKey === 'settings.name.too_soon' && typeof error.details.date === 'string') {
      const { locale } = await getTranslator();
      return { status: 'error', message: t('settings.name.too_soon', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(error.details.date)) }) };
    }
    return { status: 'error', message: t((error.messageKey.startsWith('settings.name.') ? error.messageKey : 'settings.name.failed') as MessageKey) };
  }
}

/** Signs out every other device; this one stays. */
export async function signOutOthersAction(_previous: SecurityState): Promise<SecurityState> {
  const session = await signedIn();
  const { t } = await getTranslator();
  const count = await db().transaction(async (tx) => {
    const revoked = await revokeAllSessions(tx, session.user.userId, 'signed_out_elsewhere', { exceptSessionId: session.sessionId });
    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: session.user.userId,
      action: 'identity.sessions_revoked',
      subjectType: 'user',
      subjectId: session.user.userId,
      metadata: { count: revoked },
    });
    return revoked;
  });
  revalidatePath('/settings');
  return { status: 'done', message: t('settings.sessions.signed_out_others', { count }) };
}
