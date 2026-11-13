import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { checkRun, keepRun } from '@/server/domains/play/progress';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/**
 * A finished run, sent as what the thumbs did (docs/PLAY.md, "Verified
 * runs"). The server plays it again and keeps only what it sees finish; the
 * time, the medal and every reward come from that replay, never from the
 * phone. Players who are not signed in keep their records on the phone and
 * never reach this.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { course?: unknown; input?: unknown; noCheckpoints?: unknown } | null;
  if (typeof body?.course !== 'string' || typeof body.input !== 'string' || body.input.length > 400_000) return NextResponse.json({ error: 'input' }, { status: 400 });
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playRun, `play:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const noCheckpoints = body.noCheckpoints === true;
  const checked = checkRun(body.course, body.input, noCheckpoints, new Date());
  if (!checked.ok) return NextResponse.json({ error: checked.refused }, { status: 422 });
  const { replayed, day } = checked;
  const outcome = await db().transaction((tx) =>
    keepRun(tx, userId, { course: body.course as string, day, input: body.input as string, noCheckpoints, seconds: replayed.seconds, medal: replayed.medal, fails: replayed.fails }),
  );
  return NextResponse.json(outcome);
}
