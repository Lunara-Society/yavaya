import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { paymentTransactions, tokenPackages, users } from '@/server/db/schema';
import { TOKEN_RULES } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { isAdmin } from '@/server/domains/access/authorize';
import { startCheckout } from './service';
import { memberCountry, routeFor } from './routing';

/**
 * Buying tokens. The member chooses a package, is sent to the provider's
 * hosted checkout, and gets the tokens when — and only when — the provider
 * confirms the payment server to server (see settleFromProvider).
 */
export async function startTokenPurchase(
  database: Database,
  params: { userId: string; packageKey: string; attemptId: string; appUrl: string; description: string },
): Promise<{ redirectUrl: string; reference: string }> {
  // The member's country picks the provider: dLocal Go where it is
  // licensed, PayPal elsewhere (config/payments.ts).
  const country = await memberCountry(database, params.userId);
  const route = routeFor(country);
  if (route.status !== 'ready') throw new DomainError('integration_unconfigured', 'payments.error.country');
  const provider = route.provider;

  const [user] = await database.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user || user.status !== 'active') throw new DomainError('forbidden', 'payments.error.account');

  // Test cards are not money. While the provider is in its test environment
  // only an administrator can buy, to try the whole flow end to end.
  if (provider.testMode?.() && !(await isAdmin(database, params.userId))) throw errors.integrationUnconfigured('payments');

  const [pkg] = await database.select().from(tokenPackages).where(and(eq(tokenPackages.key, params.packageKey), eq(tokenPackages.enabled, true))).limit(1);
  if (!pkg) throw errors.validation('payments.error.package');
  if (pkg.tokens > TOKEN_RULES.maxTokensPerPurchase) throw errors.validation('error.tokens.purchase_limit_exceeded', { limit: TOKEN_RULES.maxTokensPerPurchase });

  const base = params.appUrl.replace(/\/$/, '');
  const { reference, redirectUrl } = await startCheckout(database, {
    domain: 'tokens',
    providerKey: provider.key,
    userId: params.userId,
    amountMinor: pkg.priceMinor,
    currency: pkg.currency,
    intent: { packageKey: pkg.key, tokens: pkg.tokens },
    idempotencyKey: `tokens:${params.userId}:${params.attemptId}`,
    description: params.description,
    // Coming back proves nothing. PayPal returns through its own route, which
    // settles server to server; dLocal Go reports by notification.
    returnUrl: provider.key === 'paypal' ? `${base}/api/payments/paypal/return` : `${base}/account/tokens?purchase=returned`,
    country,
    cancelUrl: `${base}/account/tokens?purchase=cancelled`,
  });
  return { reference, redirectUrl };
}

export type PurchaseView = { reference: string; tokens: number; amountMinor: number; currency: string; status: string; createdAt: Date };

/** This member's token purchases, newest first. */
export async function myTokenPurchases(executor: Executor, userId: string, limit = 10): Promise<PurchaseView[]> {
  const rows = await executor
    .select()
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.userId, userId), eq(paymentTransactions.domain, 'tokens')))
    .orderBy(paymentTransactions.createdAt)
    .limit(100);
  return rows
    .reverse()
    .slice(0, limit)
    .map((row) => ({ reference: row.reference, tokens: Number(row.intent.tokens ?? 0), amountMinor: Number(row.amountMinor), currency: row.currency, status: row.status, createdAt: row.createdAt }));
}
