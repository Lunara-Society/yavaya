import { db } from '@/server/db/client';
import { abandonUpload } from '@/server/domains/mirador/upload';
import { guard, json, refusal } from '../../shared';

export const dynamic = 'force-dynamic';

/** The member cancelled an upload: its parts are thrown away. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const { id } = await params;
  try {
    await db().transaction((tx) => abandonUpload(tx, { userId: who.userId!, videoId: id }));
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.upload.abandon');
  }
}
