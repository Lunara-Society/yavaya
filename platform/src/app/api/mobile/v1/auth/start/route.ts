import { NextResponse } from 'next/server';
import { currentSession } from '@/server/auth/context';
import { holdHandoff, isMobileRedirect, validPkceValue, validState } from '@/server/auth/mobile';
import { siteUrl } from '@/server/seo';

import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

const FINISH = '/api/mobile/v1/auth/finish';

/**
 * The app opens this in the phone's real browser to sign someone in
 * (src/server/auth/mobile.ts). It remembers which app asked and with which
 * PKCE challenge, then hands over to the website's own sign-in, asked to come
 * back to `finish` afterwards. Already signed in on this browser: straight to
 * `finish`, unless the app asked for a fresh sign-in (another account).
 *
 *   ?redirect_uri=yavaya://auth&state=…&code_challenge=…&code_challenge_method=S256
 *   &via=google   — go straight to "Continuar con Google"
 *   &fresh=1      — sign in again even if this browser already is
 */
export async function GET(request: Request) {
  const base = siteUrl();
  const params = new URL(request.url).searchParams;
  const redirect = params.get('redirect_uri');
  const state = params.get('state');
  const challenge = params.get('code_challenge');
  if (!isMobileRedirect(redirect) || !validState(state) || !validPkceValue(challenge) || params.get('code_challenge_method') !== 'S256') {
    return NextResponse.json({ error: 'invalid_request' }, { status: HTTP.badRequest, headers: { 'Cache-Control': 'no-store' } });
  }
  await holdHandoff({ redirect, state, challenge });

  const fresh = params.get('fresh') === '1';
  if (!fresh && (await currentSession())) return NextResponse.redirect(`${base}${FINISH}`, HTTP.seeOther);

  const next = encodeURIComponent(FINISH);
  const target = params.get('via') === 'google' ? `/auth/google?next=${next}${fresh ? '&otra=1' : ''}` : `/login?next=${next}`;
  return NextResponse.redirect(`${base}${target}`, HTTP.seeOther);
}
