import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { isDomainError } from '@/server/errors';
import { exchangeCode, googleSignIn, readIdToken, signInWithGoogle } from '@/server/domains/identity/google';
import { hasUnseenWelcome } from '@/server/domains/access/welcome';
import { createSession } from '@/server/auth/session';
import { setSessionCookie } from '@/server/auth/cookies';
import { requestContext } from '@/server/auth/context';
import { holdSignup, rememberGoogle, takeFlow } from '@/server/auth/google-cookies';
import { safeEqual } from '@/server/security/crypto';
import { siteUrl } from '@/server/seo';

export const dynamic = 'force-dynamic';

/**
 * Google sends the visitor back here with a one-time code. Every failure ends
 * on the sign-in page with a short reason, never with a stack of detail.
 */
export async function GET(request: Request) {
  const base = siteUrl();
  const fail = (reason: 'cancelled' | 'failed' | 'unavailable' | 'busy') => NextResponse.redirect(`${base}/login?google=${reason}`, 303);

  const google = googleSignIn();
  const flow = await takeFlow();
  if (!google.available) return NextResponse.redirect(`${base}/login`, 303);

  const params = new URL(request.url).searchParams;
  if (params.get('error')) return fail('cancelled');
  const code = params.get('code');
  const state = params.get('state') ?? '';
  // The state proves this answer belongs to a request this browser started.
  if (!flow || !code || !safeEqual(state, flow.state)) return fail('failed');

  const idToken = await exchangeCode(google, code, flow.verifier);
  const profile = idToken ? readIdToken(idToken, { clientId: google.clientId, nonce: flow.nonce }) : null;
  if (!profile) return fail('failed');

  const context = await requestContext();
  let outcome;
  try {
    outcome = await signInWithGoogle(db(), profile, context);
  } catch (error) {
    return fail(isDomainError(error) && error.code === 'rate_limited' ? 'busy' : 'failed');
  }

  if (outcome.kind === 'refused') return fail('unavailable');
  if (outcome.kind === 'new_member') {
    await holdSignup({ profile, next: flow.next, inviter: flow.inviter });
    return NextResponse.redirect(`${base}/register/google`, 303);
  }

  const userId = outcome.userId;
  const session = await db().transaction((tx) => createSession(tx, { userId, ipHash: context.addressHash, userAgent: context.userAgent }));
  await setSessionCookie(session.token, session.absoluteExpiresAt);
  await rememberGoogle(profile.subject);
  // Someone just named to the team sees their welcome first, once.
  const welcome = await hasUnseenWelcome(db(), userId);
  return NextResponse.redirect(`${base}${welcome ? '/welcome' : flow.next}`, 303);
}
