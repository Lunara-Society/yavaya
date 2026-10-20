import 'server-only';
import { db } from '@/server/db/client';
import { isDomainError } from '@/server/errors';
import { signInWithGoogle, type GoogleProfile } from '@/server/domains/identity/google';
import { requestContext } from './context';
import { holdSignup } from './google-cookies';
import { beginSignIn } from './sign-in';

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
  // With two-step on, Google is the first factor, not the whole way in.
  return { ok: true, to: await beginSignIn(outcome.userId, next, profile.subject) };
}
