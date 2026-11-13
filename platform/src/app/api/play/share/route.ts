import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { shareRun } from '@/server/domains/play/progress';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/** Makes one of the player's own kept runs a challenge others may race (a link for WhatsApp). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  if (typeof body?.runId !== 'string') return NextResponse.json({ error: 'input' }, { status: 400 });
  const ok = await shareRun(db(), session.user.userId, body.runId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, path: `/play?reto=${body.runId}` });
}
