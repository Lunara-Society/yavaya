import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { currentSession } from '@/server/auth/context';
import { startGoogleConnect } from '@/server/domains/roxi/connectors/service';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

/** Sends the member to Google's permission screen for Gmail and Calendar. */
export async function GET() {
  const base = serverEnv().APP_URL.replace(/\/$/, '');
  const session = await currentSession();
  if (!session) return NextResponse.redirect(`${base}/login?next=/roxi/connections`, 303);
  try {
    return NextResponse.redirect(await startGoogleConnect(db(), session.user.userId), 303);
  } catch (error) {
    const key = error instanceof DomainError ? error.messageKey.split('.').pop() : 'failed';
    return NextResponse.redirect(`${base}/roxi/connections?error=${key}`, 303);
  }
}
