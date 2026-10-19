import 'server-only';
import { db } from '@/server/db/client';
import { isDomainError } from '@/server/errors';
import { signInWithGoogle, type GoogleProfile } from '@/server/domains/identity/google';
import { hasUnseenWelcome } from '@/server/domains/access/welcome';
import { createSession } from './session';
import { setSessionCookie } from './cookies';
import { requestContext } from './context';
import { holdSignup, rememberGoogle } from './google-cookies';

export type GoogleFinish = { ok: true; to: string } | { ok: false; reason: 'unavailable' | 'busy' | 'failed' };

/**
 * What happens once Google has vouched for someone — the same whether they
 * pressed the button or accepted the prompt: into their account, on to the
 * terms page if they are new, or a short reason if not.
 */
export async function finishGoogleSignIn(profile: GoogleProfile, next: string, inviter?: string): Promise<GoogleFinish> {
  const context = await requestContext();
  let outcome;
  try {
    outcome = await signInWithGoogle(db(), profile, context);
  } catch (error) {
    return { ok: false, reason: isDomainError(error) && error.code === 'rate_limited' ? 'busy' : 'failed' };
  }
  if (outcome.kind === 'refused') return { ok: false, reason: 'unavailable' };
  if (outcome.kind === 'new_member') {
    await holdSignup({ profile, next, inviter });
    return { ok: true, to: '/register/google' };
  }
  const userId = outcome.userId;
  const session = await db().transaction((tx) => createSession(tx, { userId, ipHash: context.addressHash, userAgent: context.userAgent }));
  await setSessionCookie(session.token, session.absoluteExpiresAt);
  await rememberGoogle(profile.subject);
  // Someone just named to the team sees their welcome first, once.
  return { ok: true, to: (await hasUnseenWelcome(db(), userId)) ? '/welcome' : next };
}
