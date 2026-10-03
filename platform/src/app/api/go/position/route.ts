import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { positionSchema, recordPosition } from '@/server/domains/go/service';

export const dynamic = 'force-dynamic';

/** A browser always sends `Origin` on a fetch POST; it must be this site. */
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

/**
 * The driver's phone reports where it is, for the order the driver holds.
 * 404 for anything that is not their open order, which tells the page to
 * stop sharing at once.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const session = await currentSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const parsed = positionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  try {
    const result = await db().transaction((tx) => recordPosition(tx, { userId: session.user.userId, position: parsed.data }));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (isDomainError(error) && error.code === 'not_found') return new NextResponse(null, { status: 404 });
    throw error;
  }
}
