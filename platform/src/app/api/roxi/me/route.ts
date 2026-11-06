import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { roxiAccount } from '@/server/domains/roxi/service';
import { creditView } from '@/server/domains/roxi/credits';
import { meteringOn } from '@/server/domains/roxi/billing';
import { ROXI_PLANS } from '@/config/business-rules';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/** The member's own standing — tokens, listings, notices — for Roxi to read out. Theirs only. */
export async function GET() {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ error: 'signed_out' }, 401);
  if (limited) return json({ error: 'too_many' }, 429);
  const { locale, t } = await getTranslator();
  const account = await roxiAccount(db(), { userId: session.user.userId, locale, t });
  // Her own plan, so she can answer "what plan am I on / how many credits do I have" — and never guess.
  const credits = await creditView(db(), session.user.userId);
  const plan = ROXI_PLANS[credits.plan.plan];
  return json({
    ...account,
    roxi: {
      plan: credits.plan.plan,
      renews: credits.plan.status === 'active' ? credits.plan.periodEnd?.toISOString().slice(0, 10) : null,
      ends: credits.plan.status === 'canceling' ? credits.plan.periodEnd?.toISOString().slice(0, 10) : null,
      credits_counted: meteringOn(),
      credits_left: meteringOn() ? credits.available : null,
      monthly_credits: plan.monthlyCredits,
      goals: plan.goals,
      reminders: plan.reminders,
      connections: plan.connections,
      plans_page: '/roxi',
    },
  });
}
