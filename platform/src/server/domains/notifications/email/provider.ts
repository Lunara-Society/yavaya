/**
 * Email delivery.
 *
 * Provider-agnostic, for the same reason payments are: Yavaya must not be
 * rebuilt because an operator changes mail vendor.
 *
 * The rule that matters here: `send` resolves only when the provider has
 * actually accepted the message. A provider that cannot deliver must reject,
 * never resolve quietly — a verification code that was never sent, reported as
 * sent, strands a real person outside their account with no way to tell why.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text is required. Many recipients in the region read mail on
   *  low-end clients, and text is what always arrives intact. */
  text: string;
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe on anything that is not a reply to
   *  something the member just did. */
  headers?: Record<string, string>;
};

export type SendResult = {
  /** Provider-side identifier, when one is returned. */
  messageId: string | null;
  /** Which adapter handled it — recorded so a failure can be traced. */
  provider: string;
};

export type EmailAvailability =
  | { available: true; provider: string }
  | { available: false; provider: string; reason: string };

export interface EmailProvider {
  readonly key: string;
  availability(): EmailAvailability;
  send(message: EmailMessage): Promise<SendResult>;
}

export class EmailUnconfiguredError extends Error {
  readonly provider: string;

  constructor(provider: string, reason: string) {
    super(`Email provider "${provider}" cannot send: ${reason}`);
    this.name = 'EmailUnconfiguredError';
    this.provider = provider;
  }
}

export class EmailDeliveryError extends Error {
  readonly provider: string;

  constructor(provider: string, cause: unknown) {
    super(`Email provider "${provider}" failed to deliver`, { cause });
    this.name = 'EmailDeliveryError';
    this.provider = provider;
  }
}
