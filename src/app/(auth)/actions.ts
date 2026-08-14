'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { sendVerificationCode } from '@/server/domains/notifications/email/service';
import { toClientError } from '@/server/errors';
import { authenticate, register, registrationSchema } from '@/server/domains/identity/service';
import { createSession } from '@/server/auth/session';
import { setSessionCookie } from '@/server/auth/cookies';
import { requestContext } from '@/server/auth/context';
import { formatYayId } from '@/server/domains/identity/yay-id';

/**
 * Authentication server actions.
 *
 * Validation happens here, on the server, against the same schema the domain
 * service uses. Whatever the browser did or did not check is irrelevant.
 */

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: string; params?: Record<string, unknown> }
  | { status: 'registered'; yayId: string; verificationNotice: 'sent' | 'undeliverable'; code?: string };

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registrationSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    displayName: String(formData.get('displayName') ?? ''),
    locale: String(formData.get('locale') ?? 'es'),
    acceptedTerms: formData.get('acceptedTerms') === 'on',
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: 'error',
      messageKey: issue?.message?.startsWith('error.') ? issue.message : 'error.validation_failed',
    };
  }

  try {
    const context = await requestContext();
    const result = await register(db(), parsed.data, context);

    const env = serverEnv();

    /*
     * The code is sent after the account commits, never inside its transaction:
     * an unreachable mail host must not roll back a valid registration, and a
     * transaction must not be held open across a network call to a third party.
     */
    const delivery = await sendVerificationCode({
      to: parsed.data.email,
      code: result.emailVerificationCode,
      locale: parsed.data.locale,
      expiresInMinutes: VERIFICATION_RULES.emailCodeTtlMinutes,
    });

    if (delivery.delivered) {
      return { status: 'registered', yayId: formatYayId(result.yayId), verificationNotice: 'sent' };
    }

    // Nothing was sent, so nothing claims it was. In local development the
    // code is shown so the flow can be finished by hand; it is never returned
    // from a deployed environment.
    return {
      status: 'registered',
      yayId: formatYayId(result.yayId),
      verificationNotice: 'undeliverable',
      code: env.APP_ENV === 'local' ? result.emailVerificationCode : undefined,
    };
  } catch (error) {
    const clientError = toClientError(error);
    return { status: 'error', messageKey: clientError.messageKey, params: clientError.details };
  }
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { status: 'error', messageKey: 'error.validation_failed' };
  }

  try {
    const context = await requestContext();
    const result = await authenticate(db(), { email, password }, context);

    if (!result.ok) {
      // Both failure modes return the same message: which addresses are
      // registered is not something an unauthenticated caller may learn.
      return { status: 'error', messageKey: 'error.unauthenticated' };
    }

    const session = await db().transaction((tx) =>
      createSession(tx, {
        userId: result.userId,
        ipHash: context.addressHash,
        userAgent: context.userAgent,
      }),
    );

    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    const clientError = toClientError(error);
    return { status: 'error', messageKey: clientError.messageKey, params: clientError.details };
  }

  redirect('/');
}
