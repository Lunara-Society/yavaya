import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { getMember, safeSpaceAvailable, touchPresence } from '@/server/domains/safe-space/service';

/** "Still here": keeps her shown as online while a page of the space is open. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  if (!safeSpaceAvailable()) return new NextResponse(null, { status: 204 });
  const session = await currentSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const member = await getMember(db(), session.user.userId);
  if (member?.status === 'active') await touchPresence(db(), member.id);
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
