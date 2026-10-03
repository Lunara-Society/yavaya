import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { readActiveImage } from '@/server/domains/media/service';
import { canSeeDriverDocument } from '@/server/domains/go/service';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A driver's identity document, for a reviewer and nobody else. Never cached anywhere. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const session = await currentSession();
  const actor = session ? { userId: session.user.userId, status: session.user.status } : null;
  if (!(await canSeeDriverDocument(db(), actor, id))) return new NextResponse(null, { status: 404 });
  const image = await readActiveImage(db(), id, { allowPrivate: true });
  if (!image) return new NextResponse(null, { status: 404 });
  return new Response(new Uint8Array(image.body), {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'no-store, private',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
