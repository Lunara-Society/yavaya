'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { getTranslator } from '@/i18n/server';
import { isLocale } from '@/i18n/config';
import { toClientError } from '@/server/errors';
import type { MessageKey } from '@/i18n';
import { requestContext } from '@/server/auth/context';
import { completeSignIn } from '@/server/auth/sign-in';
import { dropSecondStep, readSecondStep } from '@/server/auth/two-step-cookies';
import { verifySecondStep } from '@/server/domains/identity/two-step';
import { requestPasswordReset, resetPassword } from '@/server/domains/identity/password';
import { passwordSchema } from '@/server/domains/identity/service';
import { canDeliverEmail, sendPasswordResetLink, sendSecurityNotice } from '@/server/domains/notifications/email/service';

export type FormState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'sent'; message: string };

/**
 * The code after the password (or Google). The account comes from the sealed
 * note left by the first step, never from the form.
 */
export async function secondStepAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getTranslator();
  const pending = await readSecondStep();
  if (!pending) return { status: 'error', message: t('two_step.error.expired') };

  const input = String(formData.get('code') ?? '').trim().slice(0, 40);
  const result = await db().transaction((tx) => verifySecondStep(tx, { userId: pending.userId, input }));
  // Turned off by an operator while this person was typing: the first factor
  // they just passed is all the account now asks for.
  if (!result.ok && result.reason !== 'not_enabled') {
    return { status: 'error', message: t(result.reason === 'rate_limited' ? 'two_step.error.rate_limited' : 'two_step.error.mismatch') };
  }

  await dropSecondStep();
  const to = await completeSignIn(pending.userId, pending.to, pending.google);
  redirect(result.ok && result.via === 'recovery' ? '/settings/dos-pasos?respaldo=1' : to);
}

/** Asks for a reset link. Says the same thing whether or not the address has an account. */
export async function forgotPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getTranslator();
  if (!canDeliverEmail()) return { status: 'error', message: t('auth.forgot.unavailable') };

  const email = String(formData.get('email') ?? '').trim().slice(0, 254);
  if (!email.includes('@')) return { status: 'error', message: t('error.validation_failed') };

  try {
    const issued = await requestPasswordReset(db(), { email, context: await requestContext() });
    if (issued) {
      // Sent after the link is stored, outside its transaction, as with verification codes.
      await sendPasswordResetLink({
        to: issued.email,
        link: `${serverEnv().APP_URL}/login/nueva-clave?t=${issued.token}`,
        locale: isLocale(issued.locale) ? issued.locale : 'es',
        expiresInMinutes: VERIFICATION_RULES.passwordResetTtlMinutes,
      });
    }
  } catch (error) {
    const clientError = toClientError(error);
    return { status: 'error', message: t(clientError.messageKey as MessageKey, clientError.details as Record<string, string | number>) };
  }
  return { status: 'sent', message: t('auth.forgot.sent', { minutes: VERIFICATION_RULES.passwordResetTtlMinutes }) };
}

/** Sets the new password from the link, then sends the person to sign in with it. */
export async function newPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getTranslator();
  const token = String(formData.get('token') ?? '').slice(0, 100);
  const password = String(formData.get('password') ?? '');
  if (password !== String(formData.get('confirm') ?? '')) return { status: 'error', message: t('auth.reset.mismatch') };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message;
    return { status: 'error', message: t((key?.startsWith('error.') ? key : 'error.validation_failed') as MessageKey) };
  }

  const result = await db().transaction((tx) => resetPassword(tx, { token, password: parsed.data }));
  if (!result.ok) return { status: 'error', message: t('auth.reset.invalid') };
  await sendSecurityNotice({ to: result.email, locale: isLocale(result.locale) ? result.locale : 'es', kind: 'password_reset' });
  redirect('/login?clave=1');
}
