import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { publicMapSummary } from '@/server/domains/go/live-map';

export const dynamic = 'force-dynamic';

/**
 * The public map's picture of YavayaGo: approved stores (whose addresses are
 * public on their own pages) and counts. No account needed, and nothing in
 * it is about a person — see publicMapSummary for what is withheld and why.
 * A few seconds of shared caching keep a busy map cheap.
 */
export async function GET() {
  const summary = await publicMapSummary(db());
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'public, max-age=10' } });
}
