/**
 * Payment provider interface.
 *
 * Yavaya does not assume any particular processor exists. Business logic talks
 * to this interface; adapters translate to a provider. Adding, replacing or
 * running two providers side by side is an adapter change, never a change to
 * token purchasing, subscriptions or delivery operations.
 *
 * Hard rules for every adapter:
 *  - A browser callback is never proof of payment. Only a signature-verified
 *    webhook or an authenticated server-to-server capture may report success.
 *  - `verifyWebhook` must actually verify. An adapter that cannot verify a
 *    signature must return `verified: false`, not assume the best.
 *  - No adapter may credit tokens, activate a subscription, or release funds.
 *    It reports what the provider says; the payment service decides.
 */

export type Money = { amountMinor: number; currency: string };

export type CheckoutRequest = {
  /** Internal reference; the adapter passes it to the provider for matching. */
  reference: string;
  money: Money;
  /** i18n-ready description key plus params, resolved by the caller. */
  description: string;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
};

export type CheckoutSession = {
  providerTransactionId: string;
  /** Where to send the user to authorise the payment. */
  redirectUrl: string;
  expiresAt: Date | null;
};

export type CaptureResult = {
  providerTransactionId: string;
  status: 'succeeded' | 'pending' | 'failed';
  money: Money;
  failureCode?: string;
  raw: Record<string, unknown>;
};

export type WebhookVerification =
  | {
      verified: true;
      providerEventId: string;
      eventType: string;
      /** Reference supplied at checkout, when the provider echoes it back. */
      reference: string | null;
      providerTransactionId: string | null;
      status: 'succeeded' | 'pending' | 'failed' | 'refunded' | 'unknown';
      money: Money | null;
      raw: Record<string, unknown>;
    }
  | { verified: false; reason: string };

export type ProviderAvailability =
  | { available: true }
  | { available: false; missing: string[]; reason: string };

export interface PaymentProvider {
  readonly key: string;
  /**
   * Whether this provider is configured. Callers must check first and report an
   * honest "payments unavailable" rather than showing a checkout that cannot work.
   */
  availability(): ProviderAvailability;
  /**
   * True when the provider is wired to its test environment: payments there
   * are not real money, so nothing bought with them may reach ordinary members.
   */
  testMode?(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Server-to-server confirmation of an authorised payment. */
  capture(providerTransactionId: string): Promise<CaptureResult>;
  /** Authoritative. Verifies the signature before interpreting the payload. */
  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<WebhookVerification>;
  refund(providerTransactionId: string, money?: Money): Promise<CaptureResult>;
}

/** Thrown by an adapter asked to act while unconfigured. */
export class ProviderUnconfiguredError extends Error {
  readonly provider: string;
  readonly missing: string[];

  constructor(provider: string, missing: string[]) {
    super(`Payment provider "${provider}" is not configured (missing: ${missing.join(', ')})`);
    this.name = 'ProviderUnconfiguredError';
    this.provider = provider;
    this.missing = missing;
  }
}
