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
 * PayPal adapter (Orders v2, https://developer.paypal.com/docs/api/orders/v2/).
 *
 * Yavaya's second provider: it serves the countries dLocal Go does not reach
 * (see config/payments.ts). The flow:
 *
 * 1. `createCheckout` creates an order (`POST /v2/checkout/orders`) and sends
 *    the member to PayPal to approve it.
 * 2. PayPal returns the member to `/api/payments/paypal/return?token=<order>`.
 *    That visit proves nothing by itself; it only prompts Yavaya to settle.
 * 3. `capture` asks PayPal, server to server, for the order. An approved
 *    order is captured (`POST …/capture`); the capture's own answer — status
 *    and amount — is what can make the payment succeed.
 *
 * A member who approves and closes the tab before returning is settled by
 * the reconciliation job, which captures approved orders the same way. That
 * is why webhooks are not needed: every path ends in the same server call.
 */

const BASE_URL = { sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' } as const;
const TIMEOUT_MS = 15_000;

type Config = { baseUrl: string; clientId: string; clientSecret: string };

function digitsOf(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** PayPal amounts are strings in the currency's own precision. */
export function paypalValue(money: Money): string {
  const digits = digitsOf(money.currency);
  return (money.amountMinor / 10 ** digits).toFixed(digits);
}

export function paypalMinor(value: string, currency: string): number {
  return Math.round(Number(value) * 10 ** digitsOf(currency));
}

type Capture = { id?: string; status?: string; amount?: { currency_code?: string; value?: string } };
type Order = { id?: string; status?: string; purchase_units?: Array<{ payments?: { captures?: Capture[] } }>; links?: Array<{ rel?: string; href?: string }> };

export class PayPalProvider implements PaymentProvider {
  readonly key = 'paypal';
  private token: { value: string; expiresAt: number; clientId: string } | null = null;

  private config(): Config | null {
    const env = serverEnv();
    if (!env.PAYPAL_ENV || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
    return { baseUrl: BASE_URL[env.PAYPAL_ENV], clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET };
  }

  availability(): ProviderAvailability {
    const env = serverEnv();
    const missing: string[] = [];
    if (!env.PAYPAL_ENV) missing.push('PAYPAL_ENV');
    if (!env.PAYPAL_CLIENT_ID) missing.push('PAYPAL_CLIENT_ID');
    if (!env.PAYPAL_CLIENT_SECRET) missing.push('PAYPAL_CLIENT_SECRET');
    if (missing.length > 0) return { available: false, missing, reason: 'PayPal app credentials are not configured.' };
    return { available: true };
  }

  testMode(): boolean {
    return serverEnv().PAYPAL_ENV !== 'live';
  }

  private requireConfig(): Config {
    const config = this.config();
    if (!config) {
      const availability = this.availability();
      throw new ProviderUnconfiguredError(this.key, availability.available ? [] : availability.missing);
    }
    return config;
  }

  private async accessToken(config: Config): Promise<string> {
    if (this.token && this.token.clientId === config.clientId && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !data.access_token) throw new Error(`PayPal token request failed: ${response.status} ${data.error ?? ''}`.trim());
    this.token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000, clientId: config.clientId };
    return data.access_token;
  }

  private async call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; requestId?: string }): Promise<T> {
    const config = this.requireConfig();
    const token = await this.accessToken(config);
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // PayPal's idempotency key: a retried call does the same thing once.
        ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as T & { name?: string; details?: Array<{ issue?: string }> };
    if (!response.ok) {
      const issue = data.details?.[0]?.issue ?? data.name ?? '';
      // The path without ids, and PayPal's issue code: never the token.
      throw Object.assign(new Error(`PayPal ${init.method} ${path.split('/').slice(0, 4).join('/')} failed: ${response.status} ${issue}`.trim()), { issue });
    }
    return data;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const order = await this.call<Order>('/v2/checkout/orders', {
      method: 'POST',
      requestId: `create-${request.reference}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: request.reference,
            custom_id: request.reference,
            description: request.description.slice(0, 127),
            amount: { currency_code: request.money.currency.toUpperCase(), value: paypalValue(request.money) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Yavaya',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: request.returnUrl,
              cancel_url: request.cancelUrl,
            },
          },
        },
      },
    });
    const approve = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
    if (!order.id || !approve) throw new Error('PayPal returned an order without id or approval link');
    return { providerTransactionId: order.id, redirectUrl: approve, expiresAt: new Date(Date.now() + 3 * 3_600_000) };
  }

  /** Reads the order and, if the buyer approved it, captures it. */
  async capture(providerTransactionId: string): Promise<CaptureResult> {
    if (!/^[A-Z0-9]{5,40}$/.test(providerTransactionId)) throw new Error('not a PayPal order id');
    const path = `/v2/checkout/orders/${providerTransactionId}`;
    let order = await this.call<Order>(path, { method: 'GET' });
    if (order.status === 'APPROVED') {
      try {
        order = await this.call<Order>(`${path}/capture`, { method: 'POST', body: {}, requestId: `capture-${providerTransactionId}` });
      } catch (error) {
        // Captured meanwhile by the other path (return page or reconciliation).
        if ((error as { issue?: string }).issue !== 'ORDER_ALREADY_CAPTURED') throw error;
        order = await this.call<Order>(path, { method: 'GET' });
      }
    }
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    const currency = capture?.amount?.currency_code ?? '';
    const amountMinor = capture?.amount?.value && currency ? paypalMinor(capture.amount.value, currency) : 0;
    const status: CaptureResult['status'] =
      order.status === 'COMPLETED' && capture?.status === 'COMPLETED'
        ? 'succeeded'
        : order.status === 'VOIDED' || capture?.status === 'DECLINED' || capture?.status === 'FAILED'
          ? 'failed'
          : // CREATED (not approved yet), PAYER_ACTION_REQUIRED, a PENDING capture: not money yet.
            'pending';
    return {
      providerTransactionId,
      status,
      money: { amountMinor, currency },
      failureCode: status === 'failed' ? String(capture?.status ?? order.status) : undefined,
      raw: { id: order.id, status: order.status, capture_id: capture?.id ?? null, capture_status: capture?.status ?? null, amount: capture?.amount ?? null },
    };
  }

  async verifyWebhook(_input: { rawBody: string; headers: Record<string, string> }): Promise<WebhookVerification> {
    // Not used: PayPal payments settle through capture (see above). An
    // unverifiable webhook is an unverified webhook — never optimistic.
    return { verified: false, reason: 'PayPal webhooks are not used; payments settle by capture.' };
  }

  async refund(providerTransactionId: string, money?: Money): Promise<CaptureResult> {
    const order = await this.call<Order>(`/v2/checkout/orders/${providerTransactionId}`, { method: 'GET' });
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!captureId) throw new Error('PayPal order has no capture to refund');
    const refund = await this.call<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }>(`/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      requestId: `refund-${captureId}`,
      body: money ? { amount: { currency_code: money.currency, value: paypalValue(money) } } : {},
    });
    const currency = refund.amount?.currency_code ?? money?.currency ?? '';
    return {
      providerTransactionId,
      status: refund.status === 'COMPLETED' ? 'succeeded' : refund.status === 'FAILED' || refund.status === 'CANCELLED' ? 'failed' : 'pending',
      money: { amountMinor: refund.amount?.value && currency ? paypalMinor(refund.amount.value, currency) : money?.amountMinor ?? 0, currency },
      raw: { id: refund.id, status: refund.status },
    };
  }
}
