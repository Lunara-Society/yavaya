import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { roxiAvailability, roxiMember } from '@/server/domains/roxi/service';
import type { MessageKey } from '@/i18n';
import { pendingWelcome } from '@/server/domains/roxi/welcome';
import { roxiLabels, roxiPresenceLabels, roxiRefusals, roxiWelcomeLabels } from '@/ui/roxi/labels';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * Whether Roxi is offered on this page load, and what it needs to start: the
 * member's first name and place for the greeting, and the interface text in
 * the member's language. Signed out, or not configured: `enabled: false`, and
 * the page shows no button at all.
 *
 * `welcome` is present only for the one recipient of a welcome voice note, on
 * a fresh login that has not heard it (src/server/domains/roxi/welcome.ts).
 */
export async function GET() {
  const availability = roxiAvailability();
  if (!availability.available) return json({ enabled: false });
  const { session } = await member();
  if (!session) return json({ enabled: false });
  const { locale, t } = await getTranslator();
  const who = await roxiMember(db(), session.user.userId, locale);
  if (!who) return json({ enabled: false });
  const pending = await pendingWelcome(db(), { userId: session.user.userId, sessionId: session.sessionId, createdAt: session.createdAt });
  const welcome = pending
    ? {
        delayMs: pending.delayMs,
        text: t(`roxi.welcome.text.${pending.key}.${pending.variant}` as MessageKey),
        labels: roxiWelcomeLabels(t),
      }
    : null;
  return json({ enabled: true, locale, member: who, labels: roxiLabels(t), refusals: roxiRefusals(), presence: roxiPresenceLabels(t), welcome });
}
