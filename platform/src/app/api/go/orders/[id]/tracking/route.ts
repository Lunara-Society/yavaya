import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { trackingForCustomer } from '@/server/domains/go/service';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The customer's map asks where their order is. Anyone else gets a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const session = await currentSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const view = await trackingForCustomer(db(), session.user.userId, id);
  if (!view) return new NextResponse(null, { status: 404 });
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store, private' } });
}
