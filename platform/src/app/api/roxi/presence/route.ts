import { db } from '@/server/db/client';
import { sameOrigin } from '@/app/api/go/upload';
import { countRoxiHelp, isRoxiHelpEvent } from '@/server/domains/roxi/help-stats';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * One thing Roxi's check-in or call led to, counted for the day. Signed-in
 * members only, within the same look-up budget as Roxi's other routes; the
 * count keeps no trace of who sent it.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false }, 401);
  if (limited) return json({ ok: false }, 429);
  const body = (await request.json().catch(() => null)) as { event?: unknown } | null;
  if (!isRoxiHelpEvent(body?.event)) return json({ ok: false }, 400);
  await countRoxiHelp(db(), body.event);
  return json({ ok: true });
}
