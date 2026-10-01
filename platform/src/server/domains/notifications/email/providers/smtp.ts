import 'server-only';
import { createTransport, type Transporter } from 'nodemailer';
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
 * SMTP delivery.
 *
 * Works with any provider that speaks SMTP, which is all of them — so choosing
 * a vendor is a credentials change, not a code change. The connection URL
 * carries the scheme (`smtps://` for implicit TLS on 465, `smtp://` with
 * STARTTLS on 587), the credentials and the host.
 *
 * The transport is created once and reused: a new TLS handshake per message
 * would be slow and would trip provider connection limits during a burst of
 * registrations.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly key = 'smtp';

  private transporter: Transporter | null = null;
  /**
   * The URL the pooled transport was built for. Rebuilding when it changes
   * means rotating SMTP credentials takes effect without a restart, instead of
   * the process quietly holding a connection to the old host.
   */
  private transporterUrl: string | null = null;

  availability(): EmailAvailability {
    const env = serverEnv();

    if (env.EMAIL_PROVIDER !== 'smtp') {
      return {
        available: false,
        provider: this.key,
        reason: `EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}", not "smtp".`,
      };
    }

    const missing: string[] = [];
    if (!env.SMTP_URL) missing.push('SMTP_URL');
    if (!env.EMAIL_FROM) missing.push('EMAIL_FROM');

    if (missing.length > 0) {
      return {
        available: false,
        provider: this.key,
        reason: `Missing ${missing.join(' and ')}.`,
      };
    }

    return { available: true, provider: this.key };
  }

  private transport(): Transporter {
    const availability = this.availability();
    if (!availability.available) {
      throw new EmailUnconfiguredError(this.key, availability.reason);
    }

    const env = serverEnv();
    const url = env.SMTP_URL as string;

    if (this.transporter && this.transporterUrl === url) return this.transporter;
    // Configuration changed under us; drop the stale pool.
    if (this.transporter) this.reset();
    // nodemailer accepts a connection URL as the sole argument; the option
    // overload does not take one, so the tuning below is merged into a single
    // options object built from the URL.
    this.transporter = createTransport({
      url,
      // Fail fast rather than hanging a registration request behind an
      // unreachable mail host.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 3,
    } as Parameters<typeof createTransport>[0]);
    this.transporterUrl = url;

    return this.transporter;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const env = serverEnv();
    try {
      const info = await this.transport().sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      });

      return { messageId: info.messageId ?? null, provider: this.key };
    } catch (error) {
      if (error instanceof EmailUnconfiguredError) throw error;
      // Never swallow this. The caller must be able to tell the member that
      // the code did not go out.
      throw new EmailDeliveryError(this.key, error);
    }
  }

  /** Drops the pooled transport. Called when the configured URL changes. */
  reset(): void {
    this.transporter?.close();
    this.transporter = null;
    this.transporterUrl = null;
  }
}
