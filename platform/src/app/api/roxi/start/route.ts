import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { sameOrigin } from '@/app/api/go/upload';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { roxiAvailability, signedConversationUrl } from '@/server/domains/roxi/service';
import { roxiPlatformStatus } from '@/server/domains/roxi/status';
import { json } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * Opens one conversation. Counted against the member's daily allowance
 * (RATE_LIMITS.roxiConversation) before anything is spent at ElevenLabs.
 *
 * With ELEVENLABS_API_KEY set, the answer is a signed link valid for this one
 * conversation, and the agent can be set to refuse anything else. Without
 * it, the browser connects with the agent id, and the agent's allowlist of
 * origins and its daily ceiling are what hold it (CONFIGURATION.md, "Roxi").
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const availability = roxiAvailability();
  if (!availability.available) return json({ ok: false }, 404);
  const session = await currentSession();
  if (!session) return json({ ok: false }, 401);
  const { t } = await getTranslator();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.roxiConversation, `user:${session.user.userId}`);
  if (!limit.allowed) return json({ ok: false, message: t('roxi.error.daily_limit') }, 429);
  const status = roxiPlatformStatus(t);
  if (availability.signed) {
    const signedUrl = await signedConversationUrl(availability.agentId);
    if (!signedUrl) return json({ ok: false, message: t('roxi.error.unavailable') }, 502);
    return json({ ok: true, signedUrl, status });
  }
  return json({ ok: true, agentId: availability.agentId, status });
}
