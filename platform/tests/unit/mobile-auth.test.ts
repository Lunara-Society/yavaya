import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { resetServerEnvCache } from '@/config/env';
import { bearerToken } from '@/server/auth/bearer';
import { isMobileRedirect, mobileCode, openMobileCode, pkceMatches, returnAddress, validPkceValue, validState } from '@/server/auth/mobile';

/**
 * Signing in from the app (src/server/auth/mobile.ts): the one-time code is
 * useless without the app's PKCE verifier, expires in two minutes, reveals
 * nothing in the address, and is only ever sent to the app's own schemes.
 */
const VERIFIER_BYTES = 48;
const LAST_TWO = -2;
const pair = () => {
  const verifier = randomBytes(VERIFIER_BYTES).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const USER = '7b4d2f0e-1c8a-4e5b-9f3d-2a6c8e1b0d47';
const TWO_MINUTES_AND_A_BIT = 121_000;
const original = { current: process.env.SESSION_SECRET, previous: process.env.SESSION_SECRET_PREVIOUS };

afterEach(() => {
  process.env.SESSION_SECRET = original.current;
  if (original.previous) process.env.SESSION_SECRET_PREVIOUS = original.previous;
  else delete process.env.SESSION_SECRET_PREVIOUS;
  resetServerEnvCache();
});

describe('the one-time code', () => {
  it('opens the account it was made for, with the right verifier', () => {
    const { verifier, challenge } = pair();
    expect(openMobileCode(mobileCode({ userId: USER, challenge }), verifier)).toEqual({ userId: USER });
  });

  it('refuses another verifier, a tampered code and an expired one', () => {
    const { verifier, challenge } = pair();
    const code = mobileCode({ userId: USER, challenge });
    expect(openMobileCode(code, pair().verifier)).toBeNull();
    const tampered = `${code.slice(0, LAST_TWO)}${code.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(openMobileCode(tampered, verifier)).toBeNull();
    expect(openMobileCode(code, verifier, Date.now() + TWO_MINUTES_AND_A_BIT)).toBeNull();
    expect(openMobileCode('', verifier)).toBeNull();
  });

  it('does not show the account id in the address', () => {
    const { challenge } = pair();
    const code = mobileCode({ userId: USER, challenge });
    expect(Buffer.from(code, 'base64url').toString('latin1')).not.toContain(USER);
    expect(code).not.toContain(USER);
  });

  it('keeps working across a secret rotation', () => {
    const { verifier, challenge } = pair();
    process.env.SESSION_SECRET = 'old-session-secret-that-is-long-enough-0000001';
    resetServerEnvCache();
    const code = mobileCode({ userId: USER, challenge });
    process.env.SESSION_SECRET = 'new-session-secret-that-is-long-enough-0000002';
    process.env.SESSION_SECRET_PREVIOUS = 'old-session-secret-that-is-long-enough-0000001';
    resetServerEnvCache();
    expect(openMobileCode(code, verifier)).toEqual({ userId: USER });
    delete process.env.SESSION_SECRET_PREVIOUS;
    resetServerEnvCache();
    expect(openMobileCode(code, verifier)).toBeNull();
  });
});

describe('the app round trip', () => {
  it('sends codes only to the app schemes', () => {
    expect(isMobileRedirect('yavaya://auth')).toBe(true);
    expect(isMobileRedirect('yavaya-dev://auth')).toBe(true);
    expect(['https://evil.example/auth', 'yavaya://other', 'yavaya:auth', '', null].map(isMobileRedirect)).toEqual([false, false, false, false, false]);
  });

  it('checks PKCE with S256 only', () => {
    const { verifier, challenge } = pair();
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier, verifier)).toBe(false);
    expect(validPkceValue('short')).toBe(false);
    expect(validState('a1B2c3D4e5F6g7H8')).toBe(true);
    expect(validState('a1B2/c3D4e5F6g7H8')).toBe(false);
  });

  it('returns to the app with the code and the app’s state', () => {
    expect(returnAddress({ redirect: 'yavaya://auth', state: 'a1B2c3D4e5F6g7H8', challenge: pair().challenge }, 'abc_def-123')).toBe(
      'yavaya://auth?code=abc_def-123&state=a1B2c3D4e5F6g7H8',
    );
  });
});

describe('the bearer header', () => {
  it('reads only a well-formed bearer token', () => {
    expect(bearerToken('Bearer Zx9_k2-Lm4Qr7Tv0Yb3Nc6')).toBe('Zx9_k2-Lm4Qr7Tv0Yb3Nc6');
    const others = ['Basic dXNlcjpwYXNz', 'Bearer abc', 'Bearer has spaces in it plenty long', 'bearer Zx9_k2-Lm4Qr7Tv0Yb3Nc6', null, ''];
    expect(others.map(bearerToken).filter((value) => value !== null)).toEqual([]);
  });
});
