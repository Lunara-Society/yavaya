import 'server-only';
import { serverEnv } from '@/config/env';
import { SANCTION_RULES } from '@/config/business-rules';
import { createTranslator, type Locale, type MessageKey } from '@/i18n';
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

/**
 * Sends a message about the account itself. Returns whether it went out and
 * never throws: the change it reports has already happened and must stand.
 */
async function sendAccountEmail(message: EmailMessage, what: string): Promise<boolean> {
  try {
    const result = await sendEmail(message);
    return result.provider !== 'console';
  } catch (error) {
    console.error(`${what} email not delivered:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** The link that sets a new password. */
export async function sendPasswordResetLink(params: { to: string; link: string; locale: Locale; expiresInMinutes: number }): Promise<boolean> {
  const t = createTranslator(params.locale);
  return sendAccountEmail(
    {
      to: params.to,
      subject: t('email.reset.subject'),
      text: [
        t('email.verify.greeting'),
        '',
        t('email.reset.body', { minutes: params.expiresInMinutes }),
        '',
        params.link,
        '',
        t('email.reset.ignore'),
        '',
        t('brand.name'),
      ].join('\n'),
    },
    'password reset',
  );
}

export type SecurityNotice = 'password_changed' | 'password_reset' | 'two_step_on' | 'two_step_off';

/**
 * Tells the account's owner that something about how they sign in changed.
 * If it was not them, this is how they find out.
 */
export async function sendSecurityNotice(params: { to: string; locale: Locale; kind: SecurityNotice }): Promise<boolean> {
  const t = createTranslator(params.locale);
  return sendAccountEmail(
    {
      to: params.to,
      subject: t(`email.security.${params.kind}.subject`),
      text: [t('email.verify.greeting'), '', t(`email.security.${params.kind}.body`), '', t('email.security.not_you'), '', t('brand.name')].join('\n'),
    },
    'security notice',
  );
}

/**
 * Tells a member about a sanction on their account: what, why, until when,
 * and how to appeal — or that it is over, or what an admin answered. The
 * internal note never appears here; only the reason category does.
 */
export async function sendSanctionNotice(params: {
  to: string;
  locale: Locale;
  kind: 'suspended' | 'banned' | 'reinstated' | 'appeal_upheld';
  reason?: string;
  until: Date | null;
  timeZone: string | null;
  appealLink: string | null;
  response: string | null;
}): Promise<boolean> {
  const t = createTranslator(params.locale);
  const lines = [t('email.verify.greeting'), '', t(`email.sanction.${params.kind}.body`)];
  if (params.reason) lines.push('', t('email.sanction.reason', { reason: t(`sanctions.reason.${params.reason}` as MessageKey) }));
  if (params.kind === 'suspended') {
    lines.push(
      '',
      params.until
        ? t('email.sanction.until', {
            date: new Intl.DateTimeFormat(params.locale === 'en' ? 'en-US' : 'es-419', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: params.timeZone ?? 'UTC',
              timeZoneName: 'short',
            }).format(params.until),
          })
        : t('email.sanction.until_review'),
    );
  }
  if (params.response) lines.push('', t('email.sanction.response'), params.response);
  if (params.appealLink) lines.push('', t('email.sanction.appeal', { days: SANCTION_RULES.appealWindowDays }), params.appealLink);
  lines.push('', t('brand.name'));
  return sendAccountEmail({ to: params.to, subject: t(`email.sanction.${params.kind}.subject`), text: lines.join('\n') }, 'sanction notice');
}
