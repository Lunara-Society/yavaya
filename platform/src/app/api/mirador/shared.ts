import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { miradorOpen } from '@/server/domains/mirador/access';

/** Mirador's routes answer for one person, never from a shared cache. */
export const noStore = { 'Cache-Control': 'private, no-store' };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

/** A domain refusal as the member should read it (an i18n key), anything else as a plain failure. */
export function refusal(error: unknown, where: string) {
  if (isDomainError(error) && error.expose) {
    const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : error.code === 'rate_limited' ? 429 : error.code === 'conflict' ? 409 : 400;
    return json({ ok: false, error: error.messageKey, details: error.details }, status);
  }
  console.error(where, error instanceof Error ? error.message.slice(0, 300) : 'failed');
  return json({ ok: false, error: 'error.unexpected' }, 500);
}

/**
 * Route handlers have no cross-site check of their own (Server Actions do),
 * so every request that changes something must come from this site: the
 * browser always sends Origin on a POST, PUT, PATCH or DELETE.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Who is asking, and whether Mirador is open to them. `write` requires a
 * signed-in member and a same-site request; reading works signed out once
 * Mirador is open to everyone.
 */
export async function guard(request: Request, options: { write: boolean }) {
  if (options.write && !sameOrigin(request)) return { response: json({ ok: false, error: 'error.forbidden' }, 403) } as const;
  const session = await currentSession();
  const userId = session?.user.userId ?? null;
  if (!(await miradorOpen(db(), userId))) return { response: json({ ok: false, error: 'error.not_found' }, 404) } as const;
  if (options.write && (!session || session.user.status !== 'active')) return { response: json({ ok: false, error: 'error.unauthenticated' }, 401) } as const;
  return { session, userId } as const;
}

/**
 * Who watched, for counting one view per viewer per day: the member, or for
 * someone signed out a hash of the day, their network and browser — enough
 * to count a visitor once, never enough to know who they are.
 */
export async function viewerKey(userId: string | null): Promise<string> {
  if (userId) return `u:${userId}`;
  const context = await requestContext();
  const day = new Date().toISOString().slice(0, 10);
  return `a:${createHash('sha256').update(`${day}:${context.addressHash ?? ''}:${(await userAgentHash()) ?? ''}`).digest('base64url').slice(0, 24)}`;
}
