import { db } from '@/server/db/client';
import { removeComment } from '@/server/domains/mirador/social';
import { guard, json, refusal } from '../../shared';

export const dynamic = 'force-dynamic';

/** Its author, or the creator of the video, takes a comment down. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  try {
    await db().transaction(async (tx) => removeComment(tx, { userId: who.userId!, commentId: (await params).id }));
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.comments.remove');
  }
}
