import { db } from '@/server/db/client';
import { closeOffer, saveOffer, type OfferInput } from '@/server/domains/mirador/offers';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The creator puts an offer on their video, or changes it. */
export async function POST(request: Request, { params }: Params) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { offer?: OfferInput } | null;
  if (!body?.offer) return json({ ok: false, error: 'error.validation_failed' }, 400);
  const videoId = (await params).id;
  try {
    await db().transaction((tx) => saveOffer(tx, { userId: who.userId!, videoId, input: body.offer! }));
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.offer.save');
  }
}

/** The creator ends the offer. */
export async function DELETE(request: Request, { params }: Params) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const videoId = (await params).id;
  try {
    await db().transaction((tx) => closeOffer(tx, { userId: who.userId!, videoId }));
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.offer.close');
  }
}
