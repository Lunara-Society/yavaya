import { db } from '@/server/db/client';
import { cancelRequest, decideRequest } from '@/server/domains/mirador/offers';
import { guard, json, refusal } from '../../shared';

export const dynamic = 'force-dynamic';

/** The creator accepts or declines a request; the member who asked may cancel it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const requestId = (await params).id;
  try {
    if (body?.action === 'accept' || body?.action === 'decline') await db().transaction((tx) => decideRequest(tx, { userId: who.userId!, requestId, accept: body.action === 'accept' }));
    else if (body?.action === 'cancel') await db().transaction((tx) => cancelRequest(tx, { userId: who.userId!, requestId }));
    else return json({ ok: false, error: 'error.validation_failed' }, 400);
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.offer.decide');
  }
}
