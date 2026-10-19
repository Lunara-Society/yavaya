import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateToken } from '@/server/security/crypto';
import { googleSignIn, verifyBrowserIdToken } from '@/server/domains/identity/google';
import { finishGoogleSignIn } from '@/server/auth/google-finish';
import { safeNext } from '@/server/auth/google-cookies';
import { seal, unseal } from '@/server/auth/sealed';
import { serverEnv } from '@/config/env';
import { siteUrl } from '@/server/seo';

export const dynamic = 'force-dynamic';

/**
 * Google's sign-in prompt — the small window that offers "Continuar como
 * Ana" when a visitor arrives. GET hands the page a fresh nonce (kept in a
 * sealed cookie); POST receives the ID token the prompt produced, checks
 * Google's signature on it and that it answers that nonce, then signs in like
 * the button does.
 */
const COOKIE = 'yav_google_prompt';

export async function GET() {
  const google = googleSignIn();
  if (!google.available) return NextResponse.json({ available: false }, { headers: { 'cache-control': 'no-store' } });
  const nonce = generateToken(24);
  (await cookies()).set(COOKIE, seal('google-prompt', { nonce }, 600), {
    httpOnly: true,
    secure: serverEnv().APP_ENV !== 'local',
    sameSite: 'lax',
    path: '/auth/google',
    maxAge: 600,
  });
  return NextResponse.json({ available: true, clientId: google.clientId, nonce }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  // Only our own pages may post here; with a SameSite cookie this closes the
  // door on another site submitting a token it obtained some other way.
  if (request.headers.get('origin') !== new URL(siteUrl()).origin) return NextResponse.json({ ok: false }, { status: 403 });
  const google = googleSignIn();
  const store = await cookies();
  const sealed = unseal<{ nonce: string }>('google-prompt', store.get(COOKIE)?.value);
  store.delete({ name: COOKIE, path: '/auth/google' });
  const body = (await request.json().catch(() => null)) as { credential?: unknown; next?: unknown } | null;
  if (!google.available || !sealed || typeof body?.credential !== 'string') return NextResponse.json({ ok: false, reason: 'failed' }, { status: 400 });

  const profile = await verifyBrowserIdToken(body.credential, { clientId: google.clientId, nonce: sealed.nonce });
  if (!profile) return NextResponse.json({ ok: false, reason: 'failed' }, { status: 400 });

  const result = await finishGoogleSignIn(profile, safeNext(typeof body.next === 'string' ? body.next : null));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
