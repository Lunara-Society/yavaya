import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetServerEnvCache } from '@/config/env';
import { startTestSmtpServer, type TestSmtpServer } from '../helpers/smtp-server';

/**
 * Email delivery, exercised against a real SMTP server over a real socket.
 *
 * The point of these tests is the honesty rule, not the plumbing: an email
 * that did not go out must never be reported as sent, because a verification
 * code silently vanishing strands a real person outside their account.
 */

let smtp: TestSmtpServer;
const originalEnv = { ...process.env };

beforeAll(async () => {
  smtp = await startTestSmtpServer();
});

afterAll(async () => {
  await smtp.close();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetServerEnvCache();
});

function configure(overrides: Record<string, string | undefined>): void {
  process.env = { ...originalEnv, ...overrides };
  resetServerEnvCache();
}

/** Imported fresh each time so the module reads the current environment. */
async function emailModule() {
  return import('@/server/domains/notifications/email/service');
}

describe('when no provider is configured', () => {
  it('reports unavailable and refuses to claim a send', async () => {
    configure({ EMAIL_PROVIDER: 'unconfigured' });
    const { emailAvailability, canDeliverEmail, sendVerificationCode } = await emailModule();

    expect(canDeliverEmail()).toBe(false);
    const availability = emailAvailability();
    expect(availability.available).toBe(false);
    if (!availability.available) {
      expect(availability.reason).toContain('EMAIL_PROVIDER');
    }

    const outcome = await sendVerificationCode({
      to: 'someone@example.com',
      code: '123456',
      locale: 'es',
      expiresInMinutes: 30,
    });

    expect(outcome).toMatchObject({ delivered: false, reason: 'unconfigured' });
  });
});

describe('when SMTP is configured', () => {
  it('actually delivers, in the requested language', async () => {
    configure({
      EMAIL_PROVIDER: 'smtp',
      SMTP_URL: `smtp://127.0.0.1:${smtp.port}`,
      EMAIL_FROM: 'Yavaya <no-reply@yavaya.test>',
    });
    const { canDeliverEmail, sendVerificationCode } = await emailModule();

    expect(canDeliverEmail()).toBe(true);

    const before = smtp.messages.length;
    const outcome = await sendVerificationCode({
      to: 'nueva.persona@example.com',
      code: '482913',
      locale: 'es',
      expiresInMinutes: 30,
    });

    expect(outcome).toMatchObject({ delivered: true, provider: 'smtp' });
    expect(smtp.messages.length).toBe(before + 1);

    const message = smtp.messages.at(-1);
    expect(message?.to).toContain('nueva.persona@example.com');
    expect(message?.from).toBe('no-reply@yavaya.test');
    // The code reached the wire, and the message is in Spanish.
    expect(message?.data).toContain('482913');
    expect(message?.data).toMatch(/verificaci/i);
  });

  it('sends English to an English-speaking member', async () => {
    configure({
      EMAIL_PROVIDER: 'smtp',
      SMTP_URL: `smtp://127.0.0.1:${smtp.port}`,
      EMAIL_FROM: 'Yavaya <no-reply@yavaya.test>',
    });
    const { sendVerificationCode } = await emailModule();

    const outcome = await sendVerificationCode({
      to: 'new.person@example.com',
      code: '751064',
      locale: 'en',
      expiresInMinutes: 30,
    });

    expect(outcome.delivered).toBe(true);
    const message = smtp.messages.at(-1);
    expect(message?.data).toContain('751064');
    expect(message?.data).toMatch(/verification code/i);
  });

  it('reports failure rather than success when the mail host is unreachable', async () => {
    // Port 1 is reserved and nothing listens there.
    configure({
      EMAIL_PROVIDER: 'smtp',
      SMTP_URL: 'smtp://127.0.0.1:1',
      EMAIL_FROM: 'Yavaya <no-reply@yavaya.test>',
    });
    const { sendVerificationCode } = await emailModule();

    const outcome = await sendVerificationCode({
      to: 'someone@example.com',
      code: '999999',
      locale: 'es',
      expiresInMinutes: 30,
    });

    // This is the whole point: a failed send is never reported as delivered.
    expect(outcome).toMatchObject({ delivered: false, reason: 'delivery_failed' });
  });

  it('is unavailable when credentials are incomplete', async () => {
    configure({ EMAIL_PROVIDER: 'smtp', SMTP_URL: undefined, EMAIL_FROM: undefined });
    const { emailAvailability } = await emailModule();

    const availability = emailAvailability();
    expect(availability.available).toBe(false);
    if (!availability.available) {
      expect(availability.reason).toContain('SMTP_URL');
    }
  });
});

describe('the console provider', () => {
  it('never reports a delivery, because it sends nothing', async () => {
    configure({ EMAIL_PROVIDER: 'console', APP_ENV: 'local' });
    const { sendVerificationCode, canDeliverEmail } = await emailModule();

    // It is reachable in local development, but it is not delivery.
    expect(canDeliverEmail()).toBe(false);

    const outcome = await sendVerificationCode({
      to: 'dev@example.com',
      code: '111111',
      locale: 'es',
      expiresInMinutes: 30,
    });

    expect(outcome).toMatchObject({ delivered: false, reason: 'unconfigured' });
  });

  it('refuses to run outside local development', async () => {
    configure({ EMAIL_PROVIDER: 'console', APP_ENV: 'production' });
    const { sendEmail, emailAvailability } = await emailModule();

    expect(emailAvailability().available).toBe(false);
    await expect(
      sendEmail({ to: 'someone@example.com', subject: 'x', text: 'y' }),
    ).rejects.toThrow(/refused outside local development/);
  });
});
