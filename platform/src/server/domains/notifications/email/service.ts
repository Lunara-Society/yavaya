import 'server-only';
import { serverEnv } from '@/config/env';
import { createTranslator, type Locale } from '@/i18n';
import {
  EmailUnconfiguredError,
  type EmailAvailability,
  type EmailMessage,
  type EmailProvider,
  type SendResult,
} from './provider';
import { SmtpEmailProvider } from './providers/smtp';
import { ResendEmailProvider } from './providers/resend';
import { ConsoleEmailProvider } from './providers/console';

/**
 * Email service.
 *
 * Chooses the adapter from configuration and renders messages from the
 * dictionaries, so a verification email arrives in the member's own language.
 * No subject line or body text is written in English inside the code.
 */

const smtp = new SmtpEmailProvider();
const resend = new ResendEmailProvider();
const consoleProvider = new ConsoleEmailProvider();

function selectProvider(): EmailProvider | null {
  switch (serverEnv().EMAIL_PROVIDER) {
    case 'smtp':
      return smtp;
    case 'resend':
      return resend;
    case 'console':
      return consoleProvider;
    default:
      return null;
  }
}

export function emailAvailability(): EmailAvailability {
  const provider = selectProvider();
  if (!provider) {
    return {
      available: false,
      provider: 'unconfigured',
      reason:
        'Set EMAIL_PROVIDER=smtp (SMTP_URL, EMAIL_FROM) or EMAIL_PROVIDER=resend (RESEND_API_KEY, EMAIL_FROM). Registration must not open to the public until this delivers, or a new member receives no verification code.',
    };
  }
  return provider.availability();
}

/** True only when a real message would actually leave the building. */
export function canDeliverEmail(): boolean {
  return emailAvailability().available;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const provider = selectProvider();
  if (!provider) {
    throw new EmailUnconfiguredError('unconfigured', 'No EMAIL_PROVIDER is configured.');
  }
  return provider.send(message);
}

export type VerificationEmailOutcome =
  | { delivered: true; provider: string }
  | { delivered: false; reason: 'unconfigured' | 'delivery_failed'; detail: string };

/**
 * Sends a verification code.
 *
 * Returns an outcome rather than throwing, because the caller has already
 * created the account: the registration must not be rolled back because a mail
 * server was briefly unreachable. What the caller must never do is report
 * success on a `delivered: false`.
 */
export async function sendVerificationCode(params: {
  to: string;
  code: string;
  locale: Locale;
  expiresInMinutes: number;
}): Promise<VerificationEmailOutcome> {
  const t = createTranslator(params.locale);

  const message: EmailMessage = {
    to: params.to,
    subject: t('email.verify.subject'),
    text: [
      t('email.verify.greeting'),
      '',
      t('email.verify.body', { minutes: params.expiresInMinutes }),
      '',
      `    ${params.code}`,
      '',
      t('email.verify.ignore'),
      '',
      t('brand.name'),
    ].join('\n'),
  };

  try {
    const result = await sendEmail(message);
    // The console provider reports a send it did not perform, so it is never
    // reported as delivered.
    if (result.provider === 'console') {
      return {
        delivered: false,
        reason: 'unconfigured',
        detail: 'The console provider logs messages instead of sending them.',
      };
    }
    return { delivered: true, provider: result.provider };
  } catch (error) {
    if (error instanceof EmailUnconfiguredError) {
      return { delivered: false, reason: 'unconfigured', detail: error.message };
    }
    // The member is told the code did not go out; the operator needs to know
    // why, or a delivery outage is invisible until someone complains.
    console.error('verification email not delivered:', error, error instanceof Error ? (error.cause ?? '') : '');
    return {
      delivered: false,
      reason: 'delivery_failed',
      detail: error instanceof Error ? error.message : 'unknown delivery failure',
    };
  }
}
