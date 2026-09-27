import 'server-only';
import { serverEnv } from '@/config/env';
import {
  EmailUnconfiguredError,
  type EmailAvailability,
  type EmailMessage,
  type EmailProvider,
  type SendResult,
} from '../provider';

/**
 * Console "delivery" — local development only.
 *
 * This does not send mail. It writes the message to the server log so a
 * developer can complete a verification flow without a mail vendor.
 *
 * It is registered as a **MOCK** capability, not a REAL one, and it refuses to
 * run outside local development. A stand-in that quietly took over in
 * production would mean every verification code silently vanished while the
 * platform reported success — precisely the failure this codebase is built to
 * make impossible.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly key = 'console';

  availability(): EmailAvailability {
    const env = serverEnv();

    if (env.EMAIL_PROVIDER !== 'console') {
      return {
        available: false,
        provider: this.key,
        reason: `EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}", not "console".`,
      };
    }

    if (env.APP_ENV !== 'local') {
      return {
        available: false,
        provider: this.key,
        reason: 'The console provider is refused outside local development.',
      };
    }

    // Deliberately not `available: true`. It is reachable, but it does not
    // deliver anything, and the capability register must say so.
    return {
      available: false,
      provider: this.key,
      reason: 'Writes messages to the server log instead of sending them. Local development only.',
    };
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const env = serverEnv();
    if (env.EMAIL_PROVIDER !== 'console' || env.APP_ENV !== 'local') {
      throw new EmailUnconfiguredError(
        this.key,
        'The console provider is refused outside local development.',
      );
    }

    // eslint-disable-next-line no-console
    console.info(
      ['', '─── email (not sent — console provider) ───', `to:      ${message.to}`, `subject: ${message.subject}`, '', message.text, '──────────────────────────────────────────', ''].join(
        '\n',
      ),
    );

    return { messageId: null, provider: this.key };
  }
}
