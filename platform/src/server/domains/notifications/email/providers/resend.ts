import 'server-only';
import { serverEnv } from '@/config/env';
import {
  EmailDeliveryError,
  EmailUnconfiguredError,
  type EmailAvailability,
  type EmailMessage,
  type EmailProvider,
  type SendResult,
} from '../provider';

/**
 * Resend delivery over HTTPS.
 *
 * Exists because SMTP is not always reachable: Railway blocks outbound SMTP
 * on every plan below Pro, so an SMTP provider there hangs until its
 * connection timeout and delivers nothing. Resend's HTTP API goes out over
 * 443 like any other request.
 *
 * `RESEND_API_URL` is overridable only so the integration test can point this
 * adapter at a local server; production leaves it unset.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly key = 'resend';

  availability(): EmailAvailability {
    const env = serverEnv();

    if (env.EMAIL_PROVIDER !== 'resend') {
      return {
        available: false,
        provider: this.key,
        reason: `EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}", not "resend".`,
      };
    }

    const missing: string[] = [];
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!env.EMAIL_FROM) missing.push('EMAIL_FROM');

    if (missing.length > 0) {
      return { available: false, provider: this.key, reason: `Missing ${missing.join(' and ')}.` };
    }

    return { available: true, provider: this.key };
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const availability = this.availability();
    if (!availability.available) {
      throw new EmailUnconfiguredError(this.key, availability.reason);
    }

    const env = serverEnv();
    let response: Response;
    try {
      response = await fetch(`${env.RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        // Fail fast rather than hanging a registration behind a slow provider.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new EmailDeliveryError(this.key, error);
    }

    if (!response.ok) {
      // The body names the problem (bad key, unverified domain, rate limit)
      // and never contains the key, so it is safe to carry into the log.
      const detail = await response.text().catch(() => '');
      throw new EmailDeliveryError(this.key, new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`));
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { messageId: body?.id ?? null, provider: this.key };
  }
}
