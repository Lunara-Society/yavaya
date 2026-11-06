import { serverEnv } from '@/config/env';
import {
  ProviderUnconfiguredError,
  type CaptureResult,
  type CheckoutRequest,
  type CheckoutSession,
  type Money,
  type PaymentProvider,
  type ProviderAvailability,
  type WebhookVerification,
} from '../provider';

/**
 * Stripe adapter (Checkout Sessions, https://docs.stripe.com/api/checkout/sessions).
 *
 * Serves every country (config/payments.ts). The member pays on Stripe's
 * hosted page; card details never reach Yavaya.
 *
 * 1. `createCheckout` creates a session in payment mode for exactly one
 *    package at its price, and sends the member to `session.url`.
 * 2. Stripe returns the member to `/api/payments/stripe/return?session_id=…`.
 *    That visit proves nothing; it only prompts Yavaya to ask Stripe.
 * 3. `capture` reads the session server to server. `payment_status: paid`,
 *    for exactly the amount asked, is the only thing that credits tokens.
 *
 * A member who pays and closes the tab is settled by `reconcile-payments`,
 * which reads the session the same way — so no webhook secret is needed.
 * Amounts: Stripe already speaks in minor units, like Yavaya.
 */

const API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 15_000;

/** Stripe's form encoding, nested keys included (`a[b][c]=v`). */
export function formEncode(value: unknown, prefix = '', out = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) formEncode(inner, prefix ? `${prefix}[${key}]` : key, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

type Session = {
  id?: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  subscription?: string | null;
};

export class StripeProvider implements PaymentProvider {
  readonly key = 'stripe';

  private secret(): string | null {
    return serverEnv().STRIPE_SECRET_KEY ?? null;
  }

  availability(): ProviderAvailability {
    if (!this.secret()) return { available: false, missing: ['STRIPE_SECRET_KEY'], reason: 'Stripe key is not configured.' };
    return { available: true };
  }

  testMode(): boolean {
    return /_test_/.test(this.secret() ?? '');
  }

  private async call(path: string, init: { method: 'GET' | 'POST' | 'DELETE'; body?: Record<string, unknown>; idempotencyKey?: string }): Promise<Session & Record<string, unknown>> {
    const secret = this.secret();
    if (!secret) throw new ProviderUnconfiguredError(this.key, ['STRIPE_SECRET_KEY']);
    const response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body ? formEncode(init.body).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as Session & { error?: { type?: string; code?: string; message?: string } };
    if (!response.ok) {
      // Stripe's error type and code; never the key, never the request.
      throw new Error(`Stripe ${init.method} ${path.split('/').slice(0, 3).join('/')} failed: ${response.status} ${data.error?.type ?? ''} ${data.error?.code ?? ''} ${data.error?.message ?? ''}`.trim());
    }
    return data as Session & Record<string, unknown>;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.call('/checkout/sessions', {
      method: 'POST',
      idempotencyKey: `checkout-${request.reference}`,
      body: {
        mode: 'payment',
        client_reference_id: request.reference,
        metadata: { reference: request.reference },
        payment_intent_data: { metadata: { reference: request.reference }, description: request.description.slice(0, 200) },
        line_items: {
          0: {
            quantity: 1,
            price_data: { currency: request.money.currency.toLowerCase(), unit_amount: request.money.amountMinor, product_data: { name: request.description.slice(0, 120) } },
          },
        },
        // Stripe fills {CHECKOUT_SESSION_ID} in; it must stay unencoded.
        success_url: `${request.returnUrl}${request.returnUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: request.cancelUrl,
        locale: 'es-419',
      },
    });
    if (!session.id || !session.url) throw new Error('Stripe returned a checkout session without id or url');
    // Unpaid sessions expire after 24 hours by default.
    return { providerTransactionId: session.id, redirectUrl: session.url, expiresAt: new Date(Date.now() + 24 * 3_600_000) };
  }

  async capture(providerTransactionId: string): Promise<CaptureResult> {
    if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(providerTransactionId)) throw new Error('not a Stripe checkout session id');
    const session = await this.call(`/checkout/sessions/${providerTransactionId}`, { method: 'GET' });
    const currency = (session.currency ?? '').toUpperCase();
    const status: CaptureResult['status'] =
      session.status === 'complete' && session.payment_status === 'paid'
        ? 'succeeded'
        : session.status === 'expired'
          ? 'failed'
          : // open, or complete but unpaid (an asynchronous method still clearing): not money yet.
            'pending';
    return {
      providerTransactionId,
      status,
      money: { amountMinor: typeof session.amount_total === 'number' ? session.amount_total : 0, currency },
      failureCode: status === 'failed' ? 'expired' : undefined,
      raw: { id: session.id, status: session.status, payment_status: session.payment_status, amount_total: session.amount_total, currency: session.currency, payment_intent: session.payment_intent ?? null, subscription: session.subscription ?? null },
    };
  }

  /**
   * A monthly subscription on Stripe's hosted page (Roxi's plans). Settles
   * like a one-off payment: the session reads `complete` and `paid` once the
   * first month is paid, and `subscription` names what renews. Renewals are
   * read from the subscription itself (getSubscription), not from webhooks.
   */
  async createSubscriptionCheckout(request: CheckoutRequest & { interval: 'month' }): Promise<CheckoutSession> {
    const session = await this.call('/checkout/sessions', {
      method: 'POST',
      idempotencyKey: `checkout-${request.reference}`,
      body: {
        mode: 'subscription',
        client_reference_id: request.reference,
        metadata: { reference: request.reference },
        subscription_data: { metadata: { reference: request.reference }, description: request.description.slice(0, 200) },
        line_items: {
          0: {
            quantity: 1,
            price_data: {
              currency: request.money.currency.toLowerCase(),
              unit_amount: request.money.amountMinor,
              recurring: { interval: request.interval },
              product_data: { name: request.description.slice(0, 120) },
            },
          },
        },
        success_url: `${request.returnUrl}${request.returnUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: request.cancelUrl,
        locale: 'es-419',
      },
    });
    if (!session.id || !session.url) throw new Error('Stripe returned a checkout session without id or url');
    return { providerTransactionId: session.id, redirectUrl: session.url, expiresAt: new Date(Date.now() + 24 * 3_600_000) };
  }

  /** A subscription as Stripe has it now. The period sits on the item in newer API versions and on the subscription in older ones. */
  async getSubscription(id: string): Promise<{ status: string; cancelAtPeriodEnd: boolean; periodStart: Date | null; periodEnd: Date | null }> {
    if (!/^sub_[A-Za-z0-9]{6,200}$/.test(id)) throw new Error('not a Stripe subscription id');
    const sub = (await this.call(`/subscriptions/${id}`, { method: 'GET' })) as Record<string, unknown>;
    const item = ((sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [])[0] ?? {};
    const pick = (key: string) => (typeof sub[key] === 'number' ? (sub[key] as number) : typeof item[key] === 'number' ? (item[key] as number) : null);
    const start = pick('current_period_start');
    const end = pick('current_period_end');
    return {
      status: String(sub.status ?? 'unknown'),
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      periodStart: start ? new Date(start * 1000) : null,
      periodEnd: end ? new Date(end * 1000) : null,
    };
  }

  /** At period end (the member keeps what they paid for), or now (replaced by another plan). */
  async cancelSubscription(id: string, when: 'period_end' | 'now'): Promise<void> {
    if (!/^sub_[A-Za-z0-9]{6,200}$/.test(id)) throw new Error('not a Stripe subscription id');
    if (when === 'now') await this.call(`/subscriptions/${id}`, { method: 'DELETE' });
    else await this.call(`/subscriptions/${id}`, { method: 'POST', body: { cancel_at_period_end: true } });
  }

  async resumeSubscription(id: string): Promise<void> {
    if (!/^sub_[A-Za-z0-9]{6,200}$/.test(id)) throw new Error('not a Stripe subscription id');
    await this.call(`/subscriptions/${id}`, { method: 'POST', body: { cancel_at_period_end: false } });
  }

  async verifyWebhook(_input: { rawBody: string; headers: Record<string, string> }): Promise<WebhookVerification> {
    // Not used: payments settle by reading the session (see above).
    return { verified: false, reason: 'Stripe webhooks are not used; payments settle by reading the session.' };
  }

  async refund(providerTransactionId: string, money?: Money): Promise<CaptureResult> {
    const session = await this.call(`/checkout/sessions/${providerTransactionId}`, { method: 'GET' });
    if (!session.payment_intent) throw new Error('Stripe session has no payment to refund');
    const refund = (await this.call('/refunds', {
      method: 'POST',
      idempotencyKey: `refund-${providerTransactionId}`,
      body: { payment_intent: session.payment_intent, ...(money ? { amount: money.amountMinor } : {}) },
    })) as Session & { status?: string; amount?: number; currency?: string };
    return {
      providerTransactionId,
      status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending',
      money: { amountMinor: refund.amount ?? money?.amountMinor ?? 0, currency: (refund.currency ?? money?.currency ?? '').toUpperCase() },
      raw: { id: refund.id, status: refund.status },
    };
  }
}
