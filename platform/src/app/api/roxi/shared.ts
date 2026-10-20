import 'server-only';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';

/** Every Roxi route answers only a signed-in member, never from a cache. */
export const noStore = { 'Cache-Control': 'private, no-store' };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

/** The signed-in member, or null; with the look-up budget spent when `lookup` is set. */
export async function member(options: { lookup?: boolean } = {}) {
  const session = await currentSession();
  if (!session) return { session: null, limited: false } as const;
  if (options.lookup) {
    const limit = await consumeRateLimit(db(), RATE_LIMITS.roxiLookup, `user:${session.user.userId}`);
    if (!limit.allowed) return { session, limited: true } as const;
  }
  return { session, limited: false } as const;
}
