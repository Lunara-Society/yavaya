import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { currentSession } from '@/server/auth/context';
import { finishGoogleConnect } from '@/server/domains/roxi/connectors/service';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

/** Google sends the member back here with a code (or a refusal). The state must name the member signed in. */
export async function GET(request: Request) {
  const base = serverEnv().APP_URL.replace(/\/$/, '');
  const back = (query: string) => NextResponse.redirect(`${base}/roxi/connections?${query}`, 303);
  const session = await currentSession();
  if (!session) return NextResponse.redirect(`${base}/login?next=/roxi/connections`, 303);
  const query = new URL(request.url).searchParams;
  if (query.get('error')) return back('error=declined');
  const code = query.get('code') ?? '';
  const state = query.get('state') ?? '';
  if (!code || !state) return back('error=expired');
  try {
    await finishGoogleConnect(db(), { userId: session.user.userId, code, state });
    return back('connected=google');
  } catch (error) {
    console.error('roxi google connect failed:', error instanceof Error ? error.message : error);
    return back(`error=${error instanceof DomainError ? error.messageKey.split('.').pop() : 'failed'}`);
  }
}
