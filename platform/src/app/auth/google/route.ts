import { NextResponse } from 'next/server';
import { generateToken } from '@/server/security/crypto';
import { authorizationUrl, googleSignIn, pkcePair } from '@/server/domains/identity/google';
import { forgetGoogle, googleHint, startFlow } from '@/server/auth/google-cookies';
import { safeNext } from '@/server/auth/return-path';
import { siteUrl } from '@/server/seo';

export const dynamic = 'force-dynamic';

/**
 * Starts "Continuar con Google". `?next=` is where to land afterwards,
 * `?invita=` carries an invitation, `?otra=1` asks Google to let the person
 * pick a different account (and forgets the remembered one).
 */
export async function GET(request: Request) {
  const google = googleSignIn();
  if (!google.available) return NextResponse.redirect(`${siteUrl()}/login`, 303);

  const params = new URL(request.url).searchParams;
  const chooseAccount = params.get('otra') === '1';
  const inviter = params.get('invita')?.trim().slice(0, 20) || undefined;
  const state = generateToken(24);
  const nonce = generateToken(24);
  const { verifier, challenge } = pkcePair();
  const hint = chooseAccount ? null : await googleHint();
  if (chooseAccount) await forgetGoogle();

  await startFlow({ state, nonce, verifier, next: safeNext(params.get('next')), inviter });
  return NextResponse.redirect(authorizationUrl(google, { state, nonce, challenge, loginHint: hint ?? undefined, chooseAccount }), 303);
}
