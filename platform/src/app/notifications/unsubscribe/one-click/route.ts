import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { setDigestEnabled, verifyUnsubscribe } from '@/server/domains/notifications/digest';

/**
 * RFC 8058 one-click unsubscribe: the mail client POSTs here from the
 * List-Unsubscribe header, without a session and without a page. The signed
 * link is the authority, and it can only ever switch the summary off.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const signature = url.searchParams.get('s') ?? '';
  if (!verifyUnsubscribe(userId, signature)) return new NextResponse(null, { status: 400 });
  await setDigestEnabled(db(), userId, false);
  return new NextResponse(null, { status: 200 });
}

/** A person who opens the link itself gets the page that asks first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return new NextResponse(null, { status: 303, headers: { Location: `/notifications/unsubscribe${url.search}` } });
}
