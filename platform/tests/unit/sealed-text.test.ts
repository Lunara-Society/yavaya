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
    // Change the second-to-last character, which carries six whole bits of the ciphertext. (It used to
    // test the last character to choose the replacement, so one run in 64 "changed" an A into an A.)
    const at = sealed.length - 2;
    const flipped = sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1);
    expect(() => unseal(secret, 'message', flipped)).toThrow();
  });
});
