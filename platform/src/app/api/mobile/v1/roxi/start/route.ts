import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { roxiAvailability } from '@/server/domains/roxi/service';
import { conversationToken, meteringOn, recordConversationStart } from '@/server/domains/roxi/billing';
import { canStart, creditView } from '@/server/domains/roxi/credits';
import { roxiPlatformStatus } from '@/server/domains/roxi/status';
import { json } from '@/app/api/roxi/shared';
import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

/**
 * Opens one voice conversation for the app: the same rules as the website's
 * /api/roxi/start (daily allowance, credits when metered, the live capability
 * register for Roxi), answered with a WebRTC conversation token, which is
 * what the React Native SDK connects with. Without an ElevenLabs key the app
 * connects with the agent id, as the website does.
 */
export async function POST() {
  const availability = roxiAvailability();
  if (!availability.available) return json({ ok: false }, HTTP.notFound);
  const session = await currentSession();
  if (!session) return json({ ok: false }, HTTP.unauthorized);
  const { t } = await getTranslator();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.roxiConversation, `user:${session.user.userId}`);
  if (!limit.allowed) return json({ ok: false, message: t('roxi.error.daily_limit') }, HTTP.tooMany);
  const status = roxiPlatformStatus(t);

  if (meteringOn()) {
    const credits = await creditView(db(), session.user.userId);
    if (!canStart(credits)) return json({ ok: false, message: t('roxi.error.no_credits'), plans: '/roxi' }, HTTP.paymentRequired);
    const issued = await conversationToken(availability.agentId);
    if (!issued) return json({ ok: false, message: t('roxi.error.unavailable') }, HTTP.badGateway);
    if (issued.conversationId) await recordConversationStart(db(), { conversationId: issued.conversationId, userId: session.user.userId });
    return json({ ok: true, conversationToken: issued.token, conversationId: issued.conversationId, status, credits: credits.available });
  }
  if (availability.signed) {
    const issued = await conversationToken(availability.agentId);
    if (!issued) return json({ ok: false, message: t('roxi.error.unavailable') }, HTTP.badGateway);
    return json({ ok: true, conversationToken: issued.token, conversationId: issued.conversationId, status });
  }
  return json({ ok: true, agentId: availability.agentId, status });
}
