import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { requestContext } from '@/server/auth/context';
import { openMobileCode } from '@/server/auth/mobile';
import { createSession, revokeSession, validateSession } from '@/server/auth/session';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { roxiMember } from '@/server/domains/roxi/service';

import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * The app trades the one-time code and its PKCE verifier for a session: an
 * ordinary session row, remembered (an app stays signed in the way a ticked
 * "Mantener mi sesión iniciada" does), sent back once and kept by the app in
 * the phone's secure storage.
 */
export async function POST(request: Request) {
  const context = await requestContext();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.login, `mobile:${context.addressHash ?? 'unknown'}`);
  if (!limit.allowed) return NextResponse.json({ error: 'too_many' }, { status: HTTP.tooMany, headers: noStore });

  const body = (await request.json().catch(() => null)) as { code?: unknown; verifier?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const verifier = typeof body?.verifier === 'string' ? body.verifier : '';
  const opened = openMobileCode(code, verifier);
  if (!opened) return NextResponse.json({ error: 'invalid_code' }, { status: HTTP.badRequest, headers: noStore });

  const session = await db().transaction((tx) =>
    createSession(tx, { userId: opened.userId, ipHash: context.addressHash, userAgent: context.userAgent, remember: true }),
  );
  // The same checks every request makes: a banned or removed account gets no session.
  const valid = await validateSession(db(), session.token);
  if (!valid) {
    await db().transaction((tx) => revokeSession(tx, session.sessionId, 'account_unavailable'));
    return NextResponse.json({ error: 'unavailable' }, { status: HTTP.forbidden, headers: noStore });
  }
  const { locale } = await getTranslator();
  const member = await roxiMember(db(), opened.userId, locale);
  return NextResponse.json(
    {
      token: session.token,
      expiresAt: session.absoluteExpiresAt.toISOString(),
      member: member ? { firstName: member.firstName, yayId: member.yayId, placeName: member.placeName } : null,
    },
    { headers: noStore },
  );
}
