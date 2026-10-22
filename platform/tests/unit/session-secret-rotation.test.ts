import { afterEach, describe, expect, it } from 'vitest';
import { resetServerEnvCache } from '@/config/env';
import { seal, unseal } from '@/server/auth/sealed';
import { unsubscribeSignature, verifyUnsubscribe } from '@/server/domains/notifications/digest';

/**
 * Rotating SESSION_SECRET: what the old secret signed — an appeal link still
 * inside its window, an unsubscribe link in an email already sent — keeps
 * working while SESSION_SECRET_PREVIOUS holds the old value, and stops once
 * it is removed.
 */
const original = { current: process.env.SESSION_SECRET, previous: process.env.SESSION_SECRET_PREVIOUS };
const OLD = 'old-session-secret-that-is-long-enough-0000001';
const NEW = 'new-session-secret-that-is-long-enough-0000002';

function secrets(current: string, previous?: string) {
  process.env.SESSION_SECRET = current;
  if (previous) process.env.SESSION_SECRET_PREVIOUS = previous;
  else delete process.env.SESSION_SECRET_PREVIOUS;
  resetServerEnvCache();
}

describe('rotating SESSION_SECRET', () => {
  afterEach(() => {
    process.env.SESSION_SECRET = original.current;
    if (original.previous) process.env.SESSION_SECRET_PREVIOUS = original.previous;
    else delete process.env.SESSION_SECRET_PREVIOUS;
    resetServerEnvCache();
  });

  it('keeps an appeal-style link signed before the rotation, while the old secret is kept', () => {
    secrets(OLD);
    const link = seal('appeal', { r: 'record' }, 3600);
    secrets(NEW, OLD);
    expect(unseal('appeal', link)).toMatchObject({ r: 'record' });
    secrets(NEW);
    expect(unseal('appeal', link)).toBeNull();
  });

  it('keeps an unsubscribe link from an earlier email working the same way', () => {
    const userId = '6f1c2b3a-1111-4222-8333-944455556666';
    secrets(OLD);
    const signature = unsubscribeSignature(userId);
    secrets(NEW, OLD);
    expect(verifyUnsubscribe(userId, signature)).toBe(true);
    secrets(NEW);
    expect(verifyUnsubscribe(userId, signature)).toBe(false);
    expect(verifyUnsubscribe(userId, unsubscribeSignature(userId))).toBe(true);
  });
});
