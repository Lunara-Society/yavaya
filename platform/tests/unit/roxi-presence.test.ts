import { describe, expect, it } from 'vitest';
import { ROXI_RULES } from '@/config/business-rules';
import { cleanPrefs, DEFAULT_PREFS, preferencesForRoxi } from '@/ui/roxi/prefs';
import { afterCall, afterCheckIn, callAfterMinutes, callDue, checkInDue, inQuietHours, type PresenceContext } from '@/ui/roxi/presence-rules';
import { differenceHash, hammingDistance, laplacianVariance, meanBrightness, photoHints } from '@/ui/roxi/photo-quality';

/** A Tuesday at 10:00 local time: outside the default quiet hours. */
const morning = new Date(2026, 9, 27, 10, 0, 0);
const base: PresenceContext = {
  now: morning,
  pathname: '/mercadito',
  prefs: DEFAULT_PREFS,
  memory: {},
  browsingMinutes: 30,
  engaged: false,
  visible: true,
};

describe('Roxi presence: the check-in', () => {
  it('appears once a day, after a while of browsing, in Available', () => {
    expect(checkInDue({ ...base, browsingMinutes: ROXI_RULES.checkInAfterMinutes - 1 })).toBe(false);
    expect(checkInDue(base)).toBe(true);
    const memory = afterCheckIn({}, morning);
    expect(checkInDue({ ...base, memory })).toBe(false);
    // The next day it may come back.
    expect(checkInDue({ ...base, memory, now: new Date(2026, 9, 28, 10, 0, 0) })).toBe(true);
  });

  it('never appears in Quiet, in quiet hours, on a sensitive page, while hidden or while Roxi is open', () => {
    expect(checkInDue({ ...base, prefs: { ...DEFAULT_PREFS, mode: 'quiet' } })).toBe(false);
    expect(checkInDue({ ...base, now: new Date(2026, 9, 27, 22, 30, 0) })).toBe(false);
    expect(checkInDue({ ...base, now: new Date(2026, 9, 27, 6, 59, 0) })).toBe(false);
    for (const page of ['/account/tokens', '/settings/dos-pasos', '/violeta', '/apelacion', '/login']) expect(checkInDue({ ...base, pathname: page })).toBe(false);
    expect(checkInDue({ ...base, visible: false })).toBe(false);
    expect(checkInDue({ ...base, engaged: true })).toBe(false);
  });
});

describe('Roxi presence: the simulated call', () => {
  const proactive = { ...base, prefs: { ...DEFAULT_PREFS, mode: 'proactive' as const } };

  it('rings only in Proactive, which the member has to choose', () => {
    expect(DEFAULT_PREFS.mode).not.toBe('proactive');
    expect(callDue(base, 15)).toBe(false);
    expect(callDue(proactive, 15)).toBe(true);
  });

  it('waits a random time inside the configured range (15 to 20 minutes to begin with)', () => {
    expect(callAfterMinutes(0)).toBe(ROXI_RULES.callAfterMinutes.min);
    expect(callAfterMinutes(1)).toBe(ROXI_RULES.callAfterMinutes.max);
    expect(callAfterMinutes(0.5)).toBeGreaterThan(ROXI_RULES.callAfterMinutes.min);
    expect(callDue({ ...proactive, browsingMinutes: 14 }, callAfterMinutes(0))).toBe(false);
  });

  it('rests for the cooldown after a decline or a missed call, and never interrupts a form', () => {
    const memory = afterCall({}, morning);
    expect(callDue({ ...proactive, memory }, 15)).toBe(false);
    const later = new Date(morning.getTime() + ROXI_RULES.callCooldownHours * 3_600_000 + 60_000);
    expect(callDue({ ...proactive, memory, now: later }, 15)).toBe(true);
    expect(callDue({ ...proactive, pathname: '/mercadito/publish' }, 15)).toBe(false);
    expect(ROXI_RULES.callRingSeconds).toBeLessThanOrEqual(20);
  });

  it('respects quiet hours that wrap past midnight', () => {
    expect(inQuietHours(23, 21, 7)).toBe(true);
    expect(inQuietHours(3, 21, 7)).toBe(true);
    expect(inQuietHours(7, 21, 7)).toBe(false);
    expect(inQuietHours(12, 13, 15)).toBe(false);
    expect(inQuietHours(14, 13, 15)).toBe(true);
    expect(inQuietHours(10, 9, 9)).toBe(false);
  });
});

describe('Roxi preferences', () => {
  it('turns anything stored into safe values', () => {
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(cleanPrefs({ mode: 'always-on', length: 'short', quietFrom: 99, keep: 'yes' })).toEqual({ ...DEFAULT_PREFS, length: 'short' });
  });

  it('tells Roxi only the answer length, as a preference', () => {
    expect(preferencesForRoxi(DEFAULT_PREFS)).toBe('');
    expect(preferencesForRoxi({ ...DEFAULT_PREFS, length: 'short' })).toMatch(/short/i);
  });
});

describe('photo checks', () => {
  const flat = (value: number, size = 16) => new Uint8ClampedArray(size * size).fill(value);
  const checker = (size = 16) => Uint8ClampedArray.from({ length: size * size }, (_, i) => ((Math.floor(i / size) + i) % 2 ? 230 : 25));

  it('notices a dark photo, a blurry one and a tiny one', () => {
    expect(meanBrightness(flat(20))).toBe(20);
    expect(photoHints({ grey: flat(20), width: 16, height: 16 }, 1600)).toEqual(['dark']);
    expect(laplacianVariance(flat(140), 16, 16)).toBe(0);
    expect(photoHints({ grey: flat(140), width: 16, height: 16 }, 1600)).toEqual(['blurry']);
    expect(photoHints({ grey: checker(), width: 16, height: 16 }, 1600)).toEqual([]);
    expect(photoHints({ grey: checker(), width: 16, height: 16 }, 300)).toEqual(['small']);
  });

  it('recognises the same photo by its hash', () => {
    const sample = Uint8ClampedArray.from({ length: 72 }, (_, i) => (i * 37) % 255);
    const other = Uint8ClampedArray.from({ length: 72 }, (_, i) => (i * 11) % 255);
    expect(differenceHash(sample)).toBe(differenceHash(Uint8ClampedArray.from(sample)));
    expect(hammingDistance(differenceHash(sample), differenceHash(sample))).toBe(0);
    expect(hammingDistance(differenceHash(sample), differenceHash(other))).toBeGreaterThan(0);
  });
});
