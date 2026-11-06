import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { sameOrigin } from '@/app/api/go/upload';
import { claimConversation, meterConversation, meteringOn } from '@/server/domains/roxi/billing';
import { creditView } from '@/server/domains/roxi/credits';
import { json } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * The panel says a conversation has ended. Metered now if ElevenLabs has
 * finished with it; otherwise the scheduled job does it in a few minutes.
 * Answers with the credits left, for the panel to show.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const session = await currentSession();
  if (!session) return json({ ok: false }, 401);
  if (!meteringOn()) return json({ ok: true, metered: false });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown } | null;
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
  if (conversationId && (await claimConversation(db(), { conversationId, userId: session.user.userId, yayId: session.user.yayId }))) {
    await meterConversation(db(), conversationId).catch(() => 'waiting');
  }
  const credits = await creditView(db(), session.user.userId);
  return json({ ok: true, metered: true, available: credits.available });
}
