import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { errors, toClientError } from '@/server/errors';
import { fetchLinkedImage } from '@/server/domains/media/link';

export const dynamic = 'force-dynamic';

/**
 * A photo from a link: the server downloads it and hands the bytes back, and
 * the member's form then sends it like a photo chosen on the phone. The
 * browser cannot fetch it itself: the site's security policy lets pages
 * connect to no other origin, and most image hosts would refuse it anyway.
 *
 * Members in good standing only, rate-limited, same origin only — this is a
 * download the server makes for whoever asks, so it is not offered to anyone
 * who has not signed in. The link itself is never stored or logged.
 */
export async function POST(request: Request) {
  const { t } = await getTranslator();
  const fail = (error: unknown, status = 400) => {
    const client = toClientError(error);
    return NextResponse.json(
      { ok: false, code: client.code, message: t(client.messageKey as MessageKey, stringParams(client.details)) },
      { status: client.code === 'internal' ? 500 : status },
    );
  };

  if (!sameOrigin(request)) return fail(errors.forbidden(), 403);
  const session = await currentSession();
  if (!session) return fail(errors.unauthenticated(), 401);
  if (session.user.status !== 'active') return fail(errors.forbidden(), 403);

  let link = '';
  try {
    const body = (await request.json()) as { url?: unknown };
    link = typeof body.url === 'string' ? body.url : '';
  } catch {
    link = '';
  }
  if (!link.trim()) return fail(errors.validation('media.link.error.invalid'));

  const limit = await consumeRateLimit(db(), RATE_LIMITS.imageLink, `user:${session.user.userId}`);
  if (!limit.allowed) return fail(errors.rateLimited(limit.retryAfterSeconds), 429);

  try {
    const image = await fetchLinkedImage(link);
    return new Response(new Uint8Array(image.body), {
      headers: {
        'content-type': image.contentType,
        'content-disposition': `attachment; filename="${image.name}"`,
        'x-image-name': image.name,
        // Bytes from someone else's server: never rendered as anything but the image they claim to be.
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}

function stringParams(details: Record<string, unknown>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
  }
  return params;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
