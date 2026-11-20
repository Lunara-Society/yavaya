import { after } from 'next/server';
import { db } from '@/server/db/client';
import { runVoiceover, startVoiceover } from '@/server/domains/mirador/voice';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

/**
 * A voiceover in Roxi's voice for the creator's own video: charged now, in
 * the same transaction as the job; made after this answer; refunded if it
 * cannot be made.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { script?: unknown; language?: unknown; originalVolume?: unknown } | null;
  const videoId = (await params).id;
  let started: { jobId: string; tokens: number };
  try {
    started = await db().transaction((tx) => startVoiceover(tx, { userId: who.userId!, videoId, script: body?.script, language: body?.language, originalVolume: body?.originalVolume }));
  } catch (error) {
    return refusal(error, 'mirador.voice.start');
  }
  after(() => runVoiceover(db(), started.jobId).catch(() => undefined));
  return json({ ok: true, ...started });
}
