import 'server-only';
import { db } from '@/server/db/client';
import { hasUnseenWelcome } from '@/server/domains/access/welcome';
import { isTwoStepEnabled } from '@/server/domains/identity/two-step';
import { createSession } from './session';
import { setSessionCookie } from './cookies';
import { requestContext } from './context';
import { rememberGoogle } from './google-cookies';
import { holdSecondStep } from './two-step-cookies';

/**
 * The one way into an account once its first factor checks out — password or
 * Google, button or prompt. With two-step on, no session is made here: the
 * person goes to the code page holding a short sealed note of who they said
 * they were, and only the code turns that into a session.
 *
 * Two-step is checked from the database, not from whether TWO_STEP_KEY is
 * set: a missing key must lock the door (recovery codes still open it), never
 * quietly take the second lock off.
 */
export async function beginSignIn(userId: string, to: string, google?: string): Promise<string> {
  if (await isTwoStepEnabled(db(), userId)) {
    await holdSecondStep({ userId, to, ...(google ? { google } : {}) });
    return '/login/codigo';
  }
  return completeSignIn(userId, to, google);
}

/** Opens the session. Returns where to go next. */
export async function completeSignIn(userId: string, to: string, google?: string): Promise<string> {
  const context = await requestContext();
  const session = await db().transaction((tx) => createSession(tx, { userId, ipHash: context.addressHash, userAgent: context.userAgent }));
  await setSessionCookie(session.token, session.absoluteExpiresAt);
  if (google) await rememberGoogle(google);
  // Someone just named to the team sees their welcome first, once.
  return (await hasUnseenWelcome(db(), userId)) ? '/welcome' : to;
}
