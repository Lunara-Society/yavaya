import { describe, expect, it } from 'vitest';
import { formatYayId, isValidYayId, parseYayId, randomYayIdDigits } from '@/server/domains/identity/yay-id';
import {
  canonicalEmail,
  emailDomain,
  isPlausibleE164,
  maskEmail,
  normalizeDisplayName,
  signalEmail,
  toE164,
} from '@/server/domains/identity/normalize';
import { IDENTITY_RULES } from '@/config/business-rules';

describe('YAY ID', () => {
  it('always produces 8 digits with a non-zero leading digit', () => {
    for (let i = 0; i < 500; i += 1) {
      const digits = randomYayIdDigits();
      expect(digits).toMatch(/^[1-9]\d{7}$/);
      expect(digits).toHaveLength(IDENTITY_RULES.yayIdDigits);
      expect(isValidYayId(digits)).toBe(true);
    }
  });

  it('formats and parses the public form', () => {
    expect(formatYayId('23678365')).toBe('YAY-23678365');
    expect(parseYayId('YAY-23678365')).toBe('23678365');
    expect(parseYayId('yay-23678365')).toBe('23678365');
    expect(parseYayId('23678365')).toBe('23678365');
  });

  it('rejects malformed identifiers rather than coercing them', () => {
    expect(parseYayId('YAY-0123456')).toBeNull(); // 7 digits
    expect(parseYayId('YAY-01234567')).toBeNull(); // leading zero
    expect(parseYayId('YAY-2367836X')).toBeNull();
    expect(parseYayId('')).toBeNull();
    expect(isValidYayId('99999999')).toBe(true);
    expect(isValidYayId('100000000')).toBe(false);
  });
});

describe('email normalization', () => {
  it('separates the login identity from the anti-duplication signal', () => {
    expect(canonicalEmail('  Person@Example.COM ')).toBe('person@example.com');
    // Dots are folded only for providers that actually ignore them.
    expect(signalEmail('first.last+yavaya@gmail.com')).toBe('firstlast@gmail.com');
    expect(signalEmail('first.last@example.com')).toBe('first.last@example.com');
    expect(signalEmail('first+tag@example.com')).toBe('first@example.com');
  });

  it('extracts the domain', () => {
    expect(emailDomain('Someone@Sub.Example.com')).toBe('sub.example.com');
    expect(emailDomain('not-an-email')).toBe('');
  });

  it('masks an address without hiding which inbox it is', () => {
    expect(maskEmail('mariajose@gmail.com')).toBe('ma••••••e@gmail.com');
    expect(maskEmail('ABC@Example.com')).toBe('ab•c@example.com');

    // A short local part is hidden entirely rather than half-revealed.
    expect(maskEmail('jo@example.com')).toBe('••@example.com');
    expect(maskEmail('a@example.com')).toBe('•@example.com');

    // Never leaks the input when it is not an address at all.
    expect(maskEmail('not-an-email')).not.toContain('not');
  });
});

describe('phone normalization', () => {
  it('applies a country prefix to a national number', () => {
    expect(toE164('5555 1234', '+502')).toBe('+50255551234');
    expect(toE164('0 8888 7777', '+505')).toBe('+50588887777');
  });

  it('keeps an already-international number', () => {
    expect(toE164('+504 9999 1111', '+502')).toBe('+50499991111');
  });

  it('returns null rather than guessing at unusable input', () => {
    expect(toE164('', '+502')).toBeNull();
    expect(toE164('12', '+502')).toBeNull();
    expect(toE164('abc', '+502')).toBeNull();
  });

  it('validates E.164 shape', () => {
    expect(isPlausibleE164('+50255551234')).toBe(true);
    expect(isPlausibleE164('50255551234')).toBe(false);
    expect(isPlausibleE164('+0255551234')).toBe(false);
  });
});

describe('display names', () => {
  it('collapses whitespace without altering the name', () => {
    expect(normalizeDisplayName('  María   José  ')).toBe('María José');
  });
});
