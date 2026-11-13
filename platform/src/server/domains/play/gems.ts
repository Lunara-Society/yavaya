import 'server-only';
import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { PLAY_RULES } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { isAdmin } from '@/server/domains/access/authorize';
import { startCheckout, stripeProvider } from '@/server/domains/payments/service';
import { memberCountry, routeFor } from '@/server/domains/payments/routing';

/**
 * Buying gems (docs/PLAY.md, "Gems"): a pack, on Stripe's own page, credited
 * only when Stripe confirms the payment server to server (the payments
 * fulfiller `play_gems`, which calls `creditGems`). The same path as tokens
 * and Roxi's credits; nothing here touches either.
 */

/** Whether gems can be bought here at all: Stripe configured, and not its test environment for anyone but an administrator. */
export function gemsOnSale(): boolean {
  return Boolean(stripeProvider());
}

export async function startGemPurchase(
  database: Database,
  params: { userId: string; packKey: string; attemptId: string; appUrl: string; description: string },
): Promise<{ redirectUrl: string }> {
  if (!stripeProvider()) throw new DomainError('integration_unconfigured', 'play.gems.unavailable');
  const route = routeFor(await memberCountry(database, params.userId));
  if (route.status !== 'ready') throw new DomainError('integration_unconfigured', 'payments.error.country');
  const [user] = await database.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user || user.status !== 'active') throw new DomainError('forbidden', 'payments.error.account');
  // Test cards are not money: in Stripe's test environment only an administrator can buy, to try the whole flow.
  if (stripeProvider()?.testMode() && !(await isAdmin(database, params.userId))) throw errors.integrationUnconfigured('payments');
  const pack = PLAY_RULES.gemPacks.find((candidate) => candidate.key === params.packKey);
  if (!pack) throw errors.validation('play.gems.unavailable');
  const base = params.appUrl.replace(/\/$/, '');
  const { redirectUrl } = await startCheckout(database, {
    domain: 'play_gems',
    providerKey: 'stripe',
    userId: params.userId,
    amountMinor: pack.priceMinor,
    currency: pack.currency,
    intent: { packKey: pack.key, gems: pack.gems },
    idempotencyKey: `play_gems:${params.userId}:${params.attemptId}`,
    description: params.description,
    // Coming back proves nothing: the return route asks Stripe before anything is credited.
    returnUrl: `${base}/api/payments/stripe/return?next=play`,
    cancelUrl: `${base}/play?gemas=cancelled`,
  });
  return { redirectUrl };
}
