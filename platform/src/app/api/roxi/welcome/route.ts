import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { sameOrigin } from '@/app/api/go/upload';
import { roxiAvailability } from '@/server/domains/roxi/service';
import { countRoxiHelp } from '@/server/domains/roxi/help-stats';
import { recordWelcomePlayed } from '@/server/domains/roxi/welcome';
import { json } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * The welcome voice note was played or dismissed on this login. One call per
 * login is counted, however many arrive; only the note's recipient, on a
 * login that still has one pending, changes anything.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  if (!roxiAvailability().available) return json({ ok: false }, 404);
  const session = await currentSession();
  if (!session) return json({ ok: false }, 401);
  const recorded = await db().transaction(async (tx) => {
    const done = await recordWelcomePlayed(tx, { userId: session.user.userId, sessionId: session.sessionId, createdAt: session.createdAt });
    // Counted here rather than by the page, so a login is counted once however often the page reports it.
    if (done) await countRoxiHelp(tx, 'welcome_played');
    return done;
  });
  return json({ ok: true, recorded });
}
