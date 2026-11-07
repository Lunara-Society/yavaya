import { describe, expect, it } from 'vitest';
import { isSilentPath, scrubBreadcrumb, scrubReport, scrubText, scrubUrl } from '@/server/observability/scrub';
import { sentryDsn } from '@/server/observability/sentry';

describe('what an error report may carry', () => {
  it('removes email addresses, the value Postgres echoes, and key-like strings', () => {
    expect(scrubText('duplicate key value violates unique constraint "users_email_key": Key (email)=(ana@example.com) already exists'))
      .toBe('duplicate key value violates unique constraint "users_email_key": Key (email)=([removed]) already exists');
    expect(scrubText('mail to ana.p+x@correo.com.ni failed')).toBe('mail to [email] failed');
    expect(scrubText('Stripe said no to sk_live_abcdefghijklmnop')).toBe('Stripe said no to [removed]');
    expect(scrubText('Cannot read properties of undefined (reading "id")')).toBe('Cannot read properties of undefined (reading "id")');
  });

  it('drops query strings, where reset and sign-in links carry their secret', () => {
    expect(scrubUrl('https://yavaya.lat/login/olvide/restablecer?token=abc#x')).toBe('https://yavaya.lat/login/olvide/restablecer');
    expect(scrubUrl('/mercadito')).toBe('/mercadito');
  });

  it('strips cookies, headers, bodies, users and local variables from a report', () => {
    const report = scrubReport({
      message: 'for ana@example.com',
      request: {
        url: 'https://yavaya.lat/account?code=123',
        query_string: 'code=123',
        cookies: { yav_session: 'secret' },
        headers: { cookie: 'yav_session=secret', 'user-agent': 'Mozilla/5.0', 'x-forwarded-for': '10.0.0.1' },
        data: { password: 'hunter2' },
      },
      user: { ip_address: '10.0.0.1', email: 'ana@example.com' },
      exception: { values: [{ value: 'bad ana@example.com', stacktrace: { frames: [{ vars: { password: 'hunter2' } }] } }] },
      server_name: 'container-123',
    });
    expect(report).toEqual({
      message: 'for [email]',
      request: { url: 'https://yavaya.lat/account', headers: { 'user-agent': 'Mozilla/5.0' } },
      exception: { values: [{ value: 'bad [email]', stacktrace: { frames: [{}] } }] },
    });
  });

  it('sends nothing at all about Espacio Violeta', () => {
    expect(scrubReport({ request: { url: 'https://yavaya.lat/violeta/sala' } })).toBeNull();
    expect(isSilentPath('/api/violeta/ping')).toBe(true);
    expect(isSilentPath('/violeta')).toBe(true);
    expect(isSilentPath('/violetas-de-maria')).toBe(false);
    expect(isSilentPath('/mercadito')).toBe(false);
  });

  it('drops console breadcrumbs and keeps only the shape of a request', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'user ana@example.com' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'http', data: { url: 'https://api.stripe.com/v1/x?key=1', method: 'GET', status_code: 500, body: 'x' } }))
      .toEqual({ category: 'http', data: { url: 'https://api.stripe.com/v1/x', method: 'GET', status_code: 500 } });
  });

  it('reports only with a well-formed DSN', () => {
    const before = process.env.SENTRY_DSN;
    try {
      delete process.env.SENTRY_DSN;
      expect(sentryDsn()).toBeUndefined();
      process.env.SENTRY_DSN = 'not a dsn';
      expect(sentryDsn()).toBeUndefined();
      process.env.SENTRY_DSN = 'https://3fa57d5d6b82996c@o1.ingest.us.sentry.io/42';
      expect(sentryDsn()).toBe('https://3fa57d5d6b82996c@o1.ingest.us.sentry.io/42');
    } finally {
      if (before === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = before;
    }
  });
});
