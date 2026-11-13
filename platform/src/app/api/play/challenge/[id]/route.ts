import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { sharedRun } from '@/server/domains/play/progress';

export const dynamic = 'force-dynamic';

/** A shared challenge: the course, the time to beat, whose it is, and the run to race as a ghost. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await sharedRun(db(), id);
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(run);
}
