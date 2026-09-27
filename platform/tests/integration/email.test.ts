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

/**
 * Resend over HTTPS, exercised against a local HTTP server that answers the
 * way Resend's API does. The real endpoint is not called from tests.
 */
describe('when Resend is configured', () => {
  type Captured = { auth: string | undefined; body: Record<string, unknown> };
  let server: import('node:http').Server;
  let port = 0;
  let status = 200;
  const captured: Captured[] = [];

  beforeAll(async () => {
    const { createServer } = await import('node:http');
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        captured.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(status === 200 ? JSON.stringify({ id: 'msg_test_1' }) : JSON.stringify({ message: 'domain not verified' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as import('node:net').AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function configureResend(): void {
    configure({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      RESEND_API_URL: `http://127.0.0.1:${port}`,
      EMAIL_FROM: 'Yavaya <no-reply@yavaya.test>',
    });
  }

  it('delivers the code through the API, in the requested language', async () => {
    status = 200;
    configureResend();
    const { canDeliverEmail, sendVerificationCode } = await emailModule();
    expect(canDeliverEmail()).toBe(true);

    const outcome = await sendVerificationCode({ to: 'nueva@example.com', code: '314159', locale: 'es', expiresInMinutes: 30 });

    expect(outcome).toMatchObject({ delivered: true, provider: 'resend' });
    const request = captured.at(-1);
    expect(request?.auth).toBe('Bearer re_test_key');
    expect(request?.body).toMatchObject({ from: 'Yavaya <no-reply@yavaya.test>', to: ['nueva@example.com'] });
    expect(String(request?.body.text)).toContain('314159');
    expect(String(request?.body.subject)).toMatch(/verificaci/i);
  });

  it('reports failure when the API rejects the message', async () => {
    status = 403;
    configureResend();
    const { sendVerificationCode } = await emailModule();

    const outcome = await sendVerificationCode({ to: 'nueva@example.com', code: '271828', locale: 'es', expiresInMinutes: 30 });

    expect(outcome).toMatchObject({ delivered: false, reason: 'delivery_failed' });
  });

  it('is unavailable without an API key', async () => {
    configure({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: undefined, EMAIL_FROM: 'Yavaya <no-reply@yavaya.test>' });
    const { emailAvailability } = await emailModule();

    const availability = emailAvailability();
    expect(availability.available).toBe(false);
    if (!availability.available) expect(availability.reason).toContain('RESEND_API_KEY');
  });
});
