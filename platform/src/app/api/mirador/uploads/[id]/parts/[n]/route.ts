import { db } from '@/server/db/client';
import { MIRADOR_RULES } from '@/config/business-rules';
import { putPart } from '@/server/domains/mirador/upload';
import { guard, json, refusal } from '../../../../shared';

export const dynamic = 'force-dynamic';

/** One part of a video, as raw bytes; refused before it is read if it says it is bigger than a part. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const { id, n } = await params;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!declared || declared > MIRADOR_RULES.partBytes) return json({ ok: false, error: 'mirador.error.part' }, 413);
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MIRADOR_RULES.partBytes) return json({ ok: false, error: 'mirador.error.part' }, 413);
  try {
    const result = await putPart(db(), { userId: who.userId!, videoId: id, partNumber: Number.parseInt(n, 10), body });
    return json({ ok: true, ...result });
  } catch (error) {
    return refusal(error, 'mirador.upload.part');
  }
}
