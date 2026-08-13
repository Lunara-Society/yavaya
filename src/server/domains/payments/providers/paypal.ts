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
 * PayPal adapter.
 *
 * PayPal is the processor available to Yavaya today, so this adapter exists —
 * but it is **not** a working integration, and it does not pretend to be. Every
 * method that would move money throws `ProviderUnconfiguredError` until real
 * credentials and the live API calls are supplied.
 *
 * TO COMPLETE THIS INTEGRATION (see docs/CONFIGURATION.md § Payments):
 *  1. Set PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID.
 *  2. Implement `createCheckout` against Orders v2 `POST /v2/checkout/orders`.
 *  3. Implement `capture` against `POST /v2/checkout/orders/{id}/capture`.
 *  4. Implement `verifyWebhook` against
 *     `POST /v1/notifications/verify-webhook-signature` — verify server-side;
 *     never trust the payload alone.
 *  5. Confirm the merchant account is permitted to operate in each target
 *     country before enabling purchases there.
 *
 * Until then `availability()` reports false, the payments service refuses to
 * start a checkout, and the UI says payments are unavailable. That is the
 * intended behaviour: no fake success, ever.
 */
export class PayPalProvider implements PaymentProvider {
  readonly key = 'paypal';

  availability(): ProviderAvailability {
    const env = serverEnv();
    const missing: string[] = [];
    if (!env.PAYPAL_ENV) missing.push('PAYPAL_ENV');
    if (!env.PAYPAL_CLIENT_ID) missing.push('PAYPAL_CLIENT_ID');
    if (!env.PAYPAL_CLIENT_SECRET) missing.push('PAYPAL_CLIENT_SECRET');
    if (!env.PAYPAL_WEBHOOK_ID) missing.push('PAYPAL_WEBHOOK_ID');

    if (missing.length > 0) {
      return {
        available: false,
        missing,
        reason: 'PayPal credentials are not configured.',
      };
    }

    // Credentials alone do not make the adapter functional: the API calls below
    // are still unimplemented. Reporting `true` here would be the exact kind of
    // fake success this codebase forbids.
    return {
      available: false,
      missing: ['implementation'],
      reason:
        'PayPal credentials are present but the Orders v2 calls are not implemented yet. ' +
        'See docs/CONFIGURATION.md § Payments.',
    };
  }

  private refuse(): never {
    const availability = this.availability();
    throw new ProviderUnconfiguredError(
      this.key,
      availability.available ? [] : availability.missing,
    );
  }

  async createCheckout(_request: CheckoutRequest): Promise<CheckoutSession> {
    this.refuse();
  }

  async capture(_providerTransactionId: string): Promise<CaptureResult> {
    this.refuse();
  }

  async verifyWebhook(_input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<WebhookVerification> {
    // An unverifiable webhook is an unverified webhook. Never optimistic.
    return { verified: false, reason: 'PayPal webhook verification is not configured.' };
  }

  async refund(_providerTransactionId: string, _money?: Money): Promise<CaptureResult> {
    this.refuse();
  }
}
