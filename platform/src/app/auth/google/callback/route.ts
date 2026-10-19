import { NextResponse } from 'next/server';
import { exchangeCode, googleSignIn, readIdToken } from '@/server/domains/identity/google';
import { finishGoogleSignIn } from '@/server/auth/google-finish';
import { takeFlow } from '@/server/auth/google-cookies';
import { safeEqual } from '@/server/security/crypto';
import { siteUrl } from '@/server/seo';

export const dynamic = 'force-dynamic';

/**
 * Google sends the visitor back here with a one-time code. Every failure ends
 * on the sign-in page with a short reason, never with a stack of detail.
 */
export async function GET(request: Request) {
  const base = siteUrl();
  const fail = (reason: string) => NextResponse.redirect(`${base}/login?google=${reason}`, 303);

  const google = googleSignIn();
  const flow = await takeFlow();
  if (!google.available) return NextResponse.redirect(`${base}/login`, 303);

  const params = new URL(request.url).searchParams;
  if (params.get('error')) return fail('cancelled');
  const code = params.get('code');
  // The state proves this answer belongs to a request this browser started.
  if (!flow || !code || !safeEqual(params.get('state') ?? '', flow.state)) return fail('failed');

  const idToken = await exchangeCode(google, code, flow.verifier);
  const profile = idToken ? readIdToken(idToken, { clientId: google.clientId, nonce: flow.nonce }) : null;
  if (!profile) return fail('failed');

  const result = await finishGoogleSignIn(profile, flow.next, flow.inviter);
  return result.ok ? NextResponse.redirect(`${base}${result.to}`, 303) : fail(result.reason);
}
