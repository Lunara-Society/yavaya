import { db } from '@/server/db/client';
import { voiceNote } from '@/server/domains/whatsapp/owner';

export const dynamic = 'force-dynamic';

/**
 * A voice note Roxi made for the owner, fetched by WhatsApp from the link she
 * sent (server/domains/whatsapp/owner.ts). Only with the link's own key, and
 * only while it is kept; anything else is a plain 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get('k') ?? '';
  const note = await voiceNote(db(), id, key);
  if (!note) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(note.audio), {
    headers: { 'content-type': note.mime, 'content-length': String(note.audio.length), 'cache-control': 'private, no-store' },
  });
}
