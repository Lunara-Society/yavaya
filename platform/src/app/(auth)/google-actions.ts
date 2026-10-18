'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { toClientError } from '@/server/errors';
import { registerWithGoogle } from '@/server/domains/identity/google';
import { createSession } from '@/server/auth/session';
import { setSessionCookie } from '@/server/auth/cookies';
import { requestContext } from '@/server/auth/context';
import { dropSignup, readSignup, rememberGoogle } from '@/server/auth/google-cookies';

export type GoogleSignupState = { status: 'idle' } | { status: 'error'; message: string };

/**
 * A new member who came through Google accepts the rules and confirms a name.
 * The address comes from the sealed cookie Google's answer left, never from
 * the form: a field could be edited to any address at all.
 */
export async function registerWithGoogleAction(_previous: GoogleSignupState, formData: FormData): Promise<GoogleSignupState> {
  const { locale, t } = await getTranslator();
  const signup = await readSignup();
  if (!signup) redirect('/register');

  const displayName = String(formData.get('displayName') ?? '').trim();
  if (displayName.length < 2 || displayName.length > 60) return { status: 'error', message: t('auth.google.signup.name_required') };
  if (formData.get('acceptedTerms') !== 'on') return { status: 'error', message: t('auth.google.signup.terms_required') };

  try {
    const context = await requestContext();
    const result = await registerWithGoogle(
      db(),
      { profile: signup.profile, displayName, locale, acceptedTerms: true, inviter: signup.inviter },
      context,
    );
    const session = await db().transaction((tx) =>
      createSession(tx, { userId: result.userId, ipHash: context.addressHash, userAgent: context.userAgent }),
    );
    await setSessionCookie(session.token, session.absoluteExpiresAt);
    await rememberGoogle(signup.profile.subject);
    await dropSignup();
  } catch (error) {
    const clientError = toClientError(error);
    return { status: 'error', message: t(clientError.messageKey as MessageKey, clientError.details as Record<string, string | number>) };
  }
  redirect(signup.next);
}
