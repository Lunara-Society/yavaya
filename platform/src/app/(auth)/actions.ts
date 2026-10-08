'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { sendVerificationCode } from '@/server/domains/notifications/email/service';
import { toClientError } from '@/server/errors';
import {
  authenticate,
  consumeVerificationCode,
  register,
  registrationSchema,
  reissueEmailVerificationCode,
} from '@/server/domains/identity/service';
import { createSession } from '@/server/auth/session';
import { setSessionCookie } from '@/server/auth/cookies';
import { currentSession, requestContext } from '@/server/auth/context';
import { formatYayId } from '@/server/domains/identity/yay-id';

/**
 * Authentication server actions.
 *
 * Validation happens here, on the server, against the same schema the domain
 * service uses. Whatever the browser did or did not check is irrelevant.
 *
 * Errors are translated here rather than in the form. A client component has
 * no translator — it would otherwise have to be handed the whole dictionary,
 * or show one generic sentence for every failure, which is what it used to do.
 */

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: string; message: string }
  | { status: 'registered'; yayId: string; verificationNotice: 'sent' | 'undeliverable'; code?: string };

/** Resolves a domain error's key against the request locale. */
async function localizedError(
  messageKey: string,
  params?: Record<string, unknown>,
): Promise<ActionState & { status: 'error' }> {
  const { t } = await getTranslator();
  return {
    status: 'error',
    messageKey,
    message: t(messageKey as MessageKey, params as Record<string, string | number> | undefined),
  };
}

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
    inviter: String(formData.get('inviter') ?? '').trim() || undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return localizedError(
      issue?.message?.startsWith('error.') ? issue.message : 'error.validation_failed',
    );
  }

  try {
    const context = await requestContext();
    const result = await register(db(), parsed.data, context);

    /*
     * The account is signed in immediately. It is `pending_verification`, which
     * grants nothing on its own — but without a session there is no way for the
     * verification page to know whose code is being entered, and asking for the
     * address again would let anyone request a code for a stranger's account.
     */
    const session = await db().transaction((tx) =>
      createSession(tx, {
        userId: result.userId,
        ipHash: context.addressHash,
        userAgent: context.userAgent,
      }),
    );
    await setSessionCookie(session.token, session.expiresAt);

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
    return localizedError(clientError.messageKey, clientError.details);
  }
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return localizedError('error.validation_failed');
  }

  try {
    const context = await requestContext();
    const result = await authenticate(db(), { email, password }, context);

    if (!result.ok) {
      // Both failure modes return the same message: which addresses are
      // registered is not something an unauthenticated caller may learn.
      return localizedError('error.unauthenticated');
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
    return localizedError(clientError.messageKey, clientError.details);
  }

  redirect('/');
}

export type VerifyState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'resent'; message: string; code?: string };

/**
 * Confirms an emailed verification code.
 *
 * The account comes from the session, never from the form: a code alone must
 * not be enough to verify someone else's address.
 */
export async function verifyEmailAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const { t } = await getTranslator();
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');

  const session = await currentSession();
  if (!session) return { status: 'error', message: t('error.unauthenticated') };

  if (code.length !== 6) {
    return { status: 'error', message: t('auth.verify.error_format') };
  }

  let result: Awaited<ReturnType<typeof consumeVerificationCode>>;
  try {
    result = await consumeVerificationCode(db(), {
      userId: session.user.userId,
      kind: 'email',
      code,
    });
  } catch (error) {
    const clientError = toClientError(error);
    return {
      status: 'error',
      message: t(
        clientError.messageKey as MessageKey,
        clientError.details as Record<string, string | number>,
      ),
    };
  }

  if (!result.ok) {
    /*
     * Each reason gets its own message. This is not the login page: the caller
     * already holds a session for this account, so telling them the code has
     * expired rather than "try again" reveals nothing they could not discover
     * by waiting, and saves them retyping a code that can never work.
     */
    const messageKey = (
      {
        expired: 'auth.verify.error_expired',
        no_challenge: 'auth.verify.error_no_challenge',
        too_many_attempts: 'auth.verify.error_too_many_attempts',
        mismatch: 'auth.verify.error_mismatch',
      } as const
    )[result.reason ?? 'mismatch'];

    return { status: 'error', message: t(messageKey) };
  }

  redirect('/account');
}

/** Sends a new code to the address on the account. */
export async function resendVerificationAction(
  _previous: VerifyState,
  _formData: FormData,
): Promise<VerifyState> {
  const { t } = await getTranslator();

  const session = await currentSession();
  if (!session) return { status: 'error', message: t('error.unauthenticated') };

  let issued: Awaited<ReturnType<typeof reissueEmailVerificationCode>>;
  try {
    issued = await reissueEmailVerificationCode(db(), { userId: session.user.userId });
  } catch (error) {
    const clientError = toClientError(error);
    return {
      status: 'error',
      message: t(
        clientError.messageKey as MessageKey,
        clientError.details as Record<string, string | number>,
      ),
    };
  }

  if (!issued.ok) {
    if (issued.reason === 'cooldown') {
      return {
        status: 'error',
        message: t('auth.verify.error_cooldown', { seconds: issued.retryAfterSeconds ?? 0 }),
      };
    }
    return {
      status: 'error',
      message: t(
        issued.reason === 'already_verified'
          ? 'auth.verify.already_verified'
          : 'auth.verify.error_daily_limit',
      ),
    };
  }

  const delivery = await sendVerificationCode({
    to: issued.email,
    code: issued.code,
    locale: issued.locale,
    expiresInMinutes: VERIFICATION_RULES.emailCodeTtlMinutes,
  });

  if (delivery.delivered) {
    return { status: 'resent', message: t('auth.verify.resent') };
  }

  // A new code exists but no message left the building. Saying "sent" here
  // would be the exact lie this codebase refuses to tell.
  return {
    status: 'resent',
    message: t('auth.verification_undeliverable'),
    code: serverEnv().APP_ENV === 'local' ? issued.code : undefined,
  };
}
