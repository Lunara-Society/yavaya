import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { board, type BoardScope } from '@/server/domains/play/progress';
import { courseById } from '@/ui/play/trials/courses';

export const dynamic = 'force-dynamic';

/** A course's leaderboard: the world, the viewer's country, or their city (docs/PLAY.md, "Leaderboards"). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const course = url.searchParams.get('course') ?? '';
  const scope = (url.searchParams.get('scope') ?? 'world') as BoardScope;
  if (!courseById(course) || !['world', 'country', 'city'].includes(scope)) return NextResponse.json({ error: 'input' }, { status: 400 });
  const session = await currentSession();
  const result = await board(db(), course, scope, session?.user.userId ?? null);
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
