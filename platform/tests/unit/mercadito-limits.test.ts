import { describe, expect, it } from 'vitest';
import { es } from '@/i18n/dictionaries/es';
import { limitsStanding, type LimitsStanding } from '@/ui/mercadito/limits';

/**
 * The line under Mercadito's limits says where this member stands. It must
 * follow the limit that binds now (the server's rules, not a guess) and fill
 * every placeholder of the sentence it picks.
 */

const established = { limited: false, used: 0, max: 3, windowDays: 7 };
const base: LimitsStanding = { newSeller: established, open: 0, freeOpenListings: 5, cost: 1, until: '' };

const placeholders = (key: keyof typeof es) => (es[key].match(/\{(\w+)\}/g) ?? []).map((p) => p.slice(1, -1));

describe('where a member stands on Mercadito', () => {
  it('a new account under its limit: how many are left, and until when', () => {
    const line = limitsStanding({ ...base, newSeller: { limited: true, used: 1, max: 3, windowDays: 7 }, open: 1, until: '7 nov 2026' });
    expect(line).toEqual({ key: 'mercadito.limits.you_new', params: { used: 1, max: 3, left: 2, date: '7 nov 2026' } });
  });

  it('a new account that used all of its first listings: when it can publish again', () => {
    const line = limitsStanding({ ...base, newSeller: { limited: true, used: 3, max: 3, windowDays: 7 }, open: 3, until: '7 nov 2026' });
    expect(line).toEqual({ key: 'mercadito.limits.you_new_full', params: { max: 3, days: 7, date: '7 nov 2026', free: 5 } });
  });

  it('the new-account limit comes first while it lasts, even with free places left', () => {
    expect(limitsStanding({ ...base, newSeller: { limited: true, used: 3, max: 3, windowDays: 7 }, open: 0 }).key).toBe('mercadito.limits.you_new_full');
  });

  it('after that, the free places left', () => {
    expect(limitsStanding({ ...base, open: 2 })).toEqual({ key: 'mercadito.limits.you_free', params: { open: 2, left: 3 } });
  });

  it('at the free maximum, what the next one costs', () => {
    expect(limitsStanding({ ...base, open: 5 })).toEqual({ key: 'mercadito.limits.you_paid', params: { open: 5, cost: 1 } });
    // Over it (the allowance was lowered since): still the cost, never a negative count.
    expect(limitsStanding({ ...base, open: 7 })).toEqual({ key: 'mercadito.limits.you_paid', params: { open: 7, cost: 1 } });
  });

  it('with paying for more switched off, never says a listing costs tokens', () => {
    expect(limitsStanding({ ...base, open: 5, cost: null })).toEqual({ key: 'mercadito.limits.you_full', params: { open: 5 } });
    expect(limitsStanding({ ...base, open: 5, cost: 0 }).key).toBe('mercadito.limits.you_full');
  });

  it('fills every placeholder of whichever sentence it picks', () => {
    const cases: LimitsStanding[] = [
      { ...base, newSeller: { limited: true, used: 1, max: 3, windowDays: 7 }, until: 'x' },
      { ...base, newSeller: { limited: true, used: 3, max: 3, windowDays: 7 }, until: 'x' },
      { ...base, open: 1 },
      { ...base, open: 5 },
      { ...base, open: 5, cost: null },
    ];
    for (const standing of cases) {
      const line = limitsStanding(standing);
      expect(Object.keys(line.params).sort(), line.key).toEqual(placeholders(line.key as keyof typeof es).sort());
    }
  });
});
