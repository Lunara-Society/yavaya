import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { SESSION_RULES } from '@/config/business-rules';
import { bearerToken } from '@/server/auth/bearer';
import { setSessionCookie } from '@/server/auth/cookies';
import { safeNext } from '@/server/auth/return-path';
import { validateSession } from '@/server/auth/session';
import { siteUrl } from '@/server/seo';

import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

const MS_PER_DAY = 86_400_000;

/**
 * Signs the app's website screens in with the app's own session. The app
 * loads this once in its web view, with its token in the Authorization header
 * of that first request (never in the address), and the web view keeps the
 * same token as its cookie: one session for the native screens and the web
 * ones, ended by signing out of either.
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const token = bearerToken(request.headers.get('authorization'));
  const session = token ? await validateSession(db(), token) : null;
  if (token && session) {
    // The server still enforces the real expiries; the cookie only has to outlive them.
    await setSessionCookie(token, new Date(Date.now() + SESSION_RULES.absoluteTimeoutDays * MS_PER_DAY));
  }
  return NextResponse.redirect(`${siteUrl()}${next}`, { status: HTTP.seeOther, headers: { 'Cache-Control': 'no-store' } });
}
