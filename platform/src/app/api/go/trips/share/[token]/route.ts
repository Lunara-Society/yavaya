import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { trackingForShare } from '@/server/domains/go/trips';

export const dynamic = 'force-dynamic';

/**
 * The live view behind a share link: anyone holding the link sees the trip
 * while it is under way, and a 404 the moment it ends. The token is the
 * whole permission, so it is long and random and never listed anywhere.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await trackingForShare(db(), token);
  if (!view) return new NextResponse(null, { status: 404 });
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex' } });
}
