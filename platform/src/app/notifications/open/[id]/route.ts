import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { openNotification } from '@/server/domains/notifications/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opening a notification: mark it read, then go where it points. Only the
 * member's own notifications, and only to a path on this site — a stored
 * link is never followed off it.
 *
 * The redirect is relative on purpose: behind the proxy `request.url` carries
 * the internal host, and an absolute URL built from it sends the member to an
 * address where their session cookie does not exist.
 */
function go(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (!session) return go('/login');
  if (!UUID.test(id)) return go('/notifications');
  const href = await openNotification(db(), { userId: session.user.userId, id });
  const safe = href && href.startsWith('/') && !href.startsWith('//') && !href.includes('\\') ? href : '/notifications';
  return go(safe);
}
