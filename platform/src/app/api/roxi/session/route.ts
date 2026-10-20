import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { roxiAvailability, roxiMember } from '@/server/domains/roxi/service';
import { roxiLabels } from '@/ui/roxi/labels';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * Whether Roxi is offered on this page load, and what it needs to start: the
 * member's first name and place for the greeting, and the interface text in
 * the member's language. Signed out, or not configured: `enabled: false`, and
 * the page shows no button at all.
 */
export async function GET() {
  const availability = roxiAvailability();
  if (!availability.available) return json({ enabled: false });
  const { session } = await member();
  if (!session) return json({ enabled: false });
  const { locale, t } = await getTranslator();
  const who = await roxiMember(db(), session.user.userId, locale);
  if (!who) return json({ enabled: false });
  return json({ enabled: true, locale, member: who, labels: roxiLabels(t) });
}
