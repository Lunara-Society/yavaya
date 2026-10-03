import { createHmac, timingSafeEqual } from 'node:crypto';
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
 * dLocal Go adapter (https://docs.dlocalgo.com/integration-api).
 *
 * The flow, and why each step is shaped the way it is:
 *
 * 1. `createCheckout` creates a payment (`POST /v1/payments`) and sends the
 *    member to dLocal Go's hosted checkout. Card details never touch Yavaya.
 * 2. dLocal Go POSTs `{"payment_id": "DP-…"}` to the notification URL on every
 *    status change, signed with HMAC-SHA256. `verifyWebhook` checks that
 *    signature — and nothing else, because the body carries no status.
 * 3. The status is then read server to server (`GET /v1/payments/:id`, in
 *    `capture`). That read, never the browser landing on `success_url`, is
 *    what can make a payment succeed.
 *
 * Amounts: Yavaya stores minor units; dLocal Go takes and returns major
 * units in the currency's own precision.
 */

const BASE_URL = { sandbox: 'https://api-sbx.dlocalgo.com', live: 'https://api.dlocalgo.com' } as const;
const TIMEOUT_MS = 15_000;

type Config = { baseUrl: string; apiKey: string; secretKey: string; notificationUrl: string };

/** Digits after the decimal point for a currency (CLP and PYG have none, USD two). */
export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function toMajor(money: Money): number {
  const digits = currencyDigits(money.currency);
  return Number((money.amountMinor / 10 ** digits).toFixed(digits));
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyDigits(currency));
}

/** dLocal Go's payment status, as Yavaya's payment service understands it. */
export function mapPaymentStatus(status: unknown): CaptureResult['status'] {
  switch (status) {
    case 'PAID':
      return 'succeeded';
    case 'REJECTED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'failed';
    default:
      // PENDING, and anything new: not money until dLocal Go says PAID.
      return 'pending';
  }
}

/** HMAC-SHA256 over api key + raw body, keyed with the secret key, as hex. */
export function notificationSignature(apiKey: string, secretKey: string, rawBody: string): string {
  return createHmac('sha256', secretKey).update(apiKey + rawBody, 'utf8').digest('hex');
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === wanted) return value;
  return undefined;
}

export class DLocalGoProvider implements PaymentProvider {
  readonly key = 'dlocalgo';

  private config(): Config | null {
    const env = serverEnv();
    if (!env.DLOCALGO_ENV || !env.DLOCALGO_API_KEY || !env.DLOCALGO_SECRET_KEY) return null;
    return {
      baseUrl: BASE_URL[env.DLOCALGO_ENV],
      apiKey: env.DLOCALGO_API_KEY,
      secretKey: env.DLOCALGO_SECRET_KEY,
      notificationUrl: `${env.APP_URL.replace(/\/$/, '')}/api/payments/dlocalgo/notify`,
    };
  }

  availability(): ProviderAvailability {
    const env = serverEnv();
    const missing: string[] = [];
    if (!env.DLOCALGO_ENV) missing.push('DLOCALGO_ENV');
    if (!env.DLOCALGO_API_KEY) missing.push('DLOCALGO_API_KEY');
    if (!env.DLOCALGO_SECRET_KEY) missing.push('DLOCALGO_SECRET_KEY');
    if (missing.length > 0) return { available: false, missing, reason: 'dLocal Go keys are not configured.' };
    return { available: true };
  }

  testMode(): boolean {
    return serverEnv().DLOCALGO_ENV !== 'live';
  }

  private requireConfig(): Config {
    const config = this.config();
    if (!config) {
      const availability = this.availability();
      throw new ProviderUnconfiguredError(this.key, availability.available ? [] : availability.missing);
    }
    return config;
  }

  private async call(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<Record<string, unknown>> {
    const config = this.requireConfig();
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${config.apiKey}:${config.secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Fall through with an empty body; the status code decides.
    }
    if (!response.ok) {
      // The provider's own code and message, never the request: it carries the key.
      const code = typeof data.code === 'number' || typeof data.code === 'string' ? String(data.code) : String(response.status);
      throw new Error(`dLocal Go ${init.method} ${path.split('/').slice(0, 3).join('/')} failed: ${response.status} ${code} ${typeof data.message === 'string' ? data.message : ''}`.trim());
    }
    return data;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const config = this.requireConfig();
    const data = await this.call('/v1/payments', {
      method: 'POST',
      body: {
        ...(request.country ? { country: request.country } : {}),
        amount: toMajor(request.money),
        currency: request.money.currency.toUpperCase(),
        order_id: request.reference,
        description: request.description.slice(0, 100),
        success_url: request.returnUrl,
        back_url: request.cancelUrl,
        notification_url: config.notificationUrl,
      },
    });
    if (typeof data.id !== 'string' || typeof data.redirect_url !== 'string') throw new Error('dLocal Go returned a payment without id or redirect_url');
    // The checkout link stops working after 24 hours (documented).
    return { providerTransactionId: data.id, redirectUrl: data.redirect_url, expiresAt: new Date(Date.now() + 24 * 3_600_000) };
  }

  /** dLocal Go captures on its own; this reads the payment's current, authoritative state. */
  async capture(providerTransactionId: string): Promise<CaptureResult> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(providerTransactionId)) throw new Error('not a dLocal Go payment id');
    const data = await this.call(`/v1/payments/${encodeURIComponent(providerTransactionId)}`, { method: 'GET' });
    const currency = typeof data.currency === 'string' ? data.currency : '';
    const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
    const status = mapPaymentStatus(data.status);
    return {
      providerTransactionId: String(data.id ?? providerTransactionId),
      status,
      money: { amountMinor: Number.isFinite(amount) && currency ? toMinor(amount, currency) : 0, currency },
      failureCode: status === 'failed' ? String(data.rejected_reason ?? data.status ?? 'failed') : undefined,
      // What is kept: status and identifiers, not the payer's name, email or document.
      raw: { id: data.id, status: data.status, status_detail: data.status_detail ?? null, order_id: data.order_id ?? null, amount: data.amount, currency: data.currency, payment_method_type: data.payment_method_type ?? null },
    };
  }

  async verifyWebhook(input: { rawBody: string; headers: Record<string, string> }): Promise<WebhookVerification> {
    const config = this.config();
    if (!config) return { verified: false, reason: 'unconfigured' };
    const header = headerValue(input.headers, 'authorization') ?? '';
    const match = /Signature:\s*([0-9a-fA-F]{64})\s*$/.exec(header);
    if (!match) return { verified: false, reason: 'missing_signature' };
    const expected = Buffer.from(notificationSignature(config.apiKey, config.secretKey, input.rawBody), 'hex');
    const given = Buffer.from(match[1]!.toLowerCase(), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { verified: false, reason: 'bad_signature' };

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      return { verified: false, reason: 'malformed_body' };
    }
    const paymentId = typeof body.payment_id === 'string' ? body.payment_id : null;
    const refundId = typeof body.refund_id === 'string' ? body.refund_id : null;
    if (!paymentId && !refundId) return { verified: false, reason: 'no_identifier' };
    return {
      verified: true,
      providerEventId: paymentId ?? refundId!,
      eventType: paymentId ? 'payment.status_changed' : 'refund.status_changed',
      reference: null,
      providerTransactionId: paymentId,
      // The notification says only that something changed. The status is read
      // from the API, never assumed from the arrival of a notification.
      status: 'unknown',
      money: null,
      raw: body,
    };
  }

  async refund(providerTransactionId: string, money?: Money): Promise<CaptureResult> {
    const config = this.requireConfig();
    const data = await this.call('/v1/refunds', {
      method: 'POST',
      body: { payment_id: providerTransactionId, ...(money ? { amount: toMajor(money) } : {}), notification_url: config.notificationUrl },
    });
    const status = data.status === 'SUCCESS' ? 'succeeded' : data.status === 'REJECTED' || data.status === 'CANCELLED' ? 'failed' : 'pending';
    const currency = typeof data.currency === 'string' ? data.currency : money?.currency ?? '';
    return {
      providerTransactionId,
      status,
      money: { amountMinor: typeof data.amount === 'number' && currency ? toMinor(data.amount, currency) : money?.amountMinor ?? 0, currency },
      raw: { id: data.id, status: data.status },
    };
  }
}
