import { describe, expect, it } from 'vitest';
import { seal, unseal } from '@/server/security/sealed-text';

const secret = 'a-test-secret-that-is-long-enough-for-hkdf-0000';

describe('sealed text', () => {
  it('round-trips and never contains the plain text', () => {
    const sealed = seal(secret, 'p', 'Mi pareja me dejó sola.');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('pareja');
    expect(unseal(secret, 'p', sealed)).toBe('Mi pareja me dejó sola.');
  });

  it('seals the same text differently each time', () => {
    expect(seal(secret, 'p', 'hola')).not.toBe(seal(secret, 'p', 'hola'));
  });

  it('refuses another purpose, another key, or any change', () => {
    const sealed = seal(secret, 'message', 'hola');
    expect(() => unseal(secret, 'report', sealed)).toThrow();
    expect(() => unseal(`${secret}x`, 'message', sealed)).toThrow();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => unseal(secret, 'message', flipped)).toThrow();
  });
});
