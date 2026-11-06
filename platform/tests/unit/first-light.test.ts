import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstLightFiles } from '@/ui/first-light/assets';
import { COOLDOWN_MS, MAX_VOICES, mayPlay } from '@/ui/first-light/sound';
import { chooseTier } from '@/ui/first-light/tier';
import { COMPLETED_MS, IDLE_RAW, toVisual, type RoxiRaw } from '@/ui/roxi/state-bus';
import { DISTRICT_IDS } from '@/ui/site/blocks';

const PUBLIC = join(__dirname, '..', '..', 'public');

describe('First Light: pictures', () => {
  it('has every file a srcset or a light map can ask for', () => {
    const missing = firstLightFiles(DISTRICT_IDS).filter((file) => !existsSync(join(PUBLIC, file)));
    expect(missing).toEqual([]);
  });
});

describe('First Light: device tiers', () => {
  it('gives no movement to anyone who asked for less, whatever the device', () => {
    expect(chooseTier({ reducedMotion: true, deviceMemory: 16, cores: 12, effectiveType: '4g' })).toBe('still');
  });

  it('keeps Data Saver, slow networks and small devices on the light version', () => {
    expect(chooseTier({ reducedMotion: false, saveData: true })).toBe('lite');
    expect(chooseTier({ reducedMotion: false, effectiveType: '3g' })).toBe('lite');
    expect(chooseTier({ reducedMotion: false, effectiveType: 'slow-2g' })).toBe('lite');
    expect(chooseTier({ reducedMotion: false, deviceMemory: 2, cores: 8 })).toBe('lite');
    expect(chooseTier({ reducedMotion: false, deviceMemory: 8, cores: 2 })).toBe('lite');
  });

  it('gives the full scene to a capable device, and does not assume a browser that reports nothing is weak', () => {
    expect(chooseTier({ reducedMotion: false, deviceMemory: 8, cores: 8, effectiveType: '4g' })).toBe('full');
    expect(chooseTier({ reducedMotion: false })).toBe('full');
  });
});

describe('First Light: Roxi shows only what is happening', () => {
  const live: RoxiRaw = { ...IDLE_RAW, available: true, open: true, phase: 'live' };
  const now = 1_000_000;

  it('is unavailable without a member and an agent, and idle when nothing happens', () => {
    expect(toVisual(IDLE_RAW, now)).toBe('unavailable');
    expect(toVisual({ ...IDLE_RAW, available: true }, now)).toBe('idle');
  });

  it('maps each real condition to its state', () => {
    expect(toVisual({ ...live, orb: 'listening' }, now)).toBe('listening');
    expect(toVisual({ ...live, waiting: true }, now)).toBe('understanding');
    expect(toVisual({ ...live, phase: 'connecting' }, now)).toBe('understanding');
    expect(toVisual({ ...live, activity: 'searching' }, now)).toBe('searching');
    expect(toVisual({ ...live, activity: 'preparing' }, now)).toBe('processing');
    expect(toVisual({ ...live, orb: 'speaking' }, now)).toBe('responding');
    expect(toVisual({ ...live, confirming: true }, now)).toBe('awaiting');
    expect(toVisual({ ...live, problem: true }, now)).toBe('error');
  });

  it('puts what needs the member first: a problem, then a waiting confirmation, then work', () => {
    expect(toVisual({ ...live, problem: true, confirming: true, activity: 'searching' }, now)).toBe('error');
    expect(toVisual({ ...live, confirming: true, activity: 'searching', orb: 'speaking' }, now)).toBe('awaiting');
  });

  it('shows "completed" only for a moment after something really finished', () => {
    expect(toVisual({ ...live, completedAt: now - 100 }, now)).toBe('completed');
    expect(toVisual({ ...live, completedAt: now - COMPLETED_MS - 1 }, now)).toBe('idle');
    expect(toVisual({ ...live, completedAt: 0 }, now)).toBe('idle');
  });
});

describe('First Light: sounds never pile up', () => {
  it('waits out each cue’s cooldown', () => {
    expect(mayPlay('door', 1000, {}, 0)).toBe(true);
    expect(mayPlay('door', 1000 + COOLDOWN_MS.door - 1, { door: 1000 }, 0)).toBe(false);
    expect(mayPlay('door', 1000 + COOLDOWN_MS.door, { door: 1000 }, 0)).toBe(true);
    expect(mayPlay('guardian', 5000, { guardian: 1000 }, 0)).toBe(false);
  });

  it('drops a cue when every voice is busy', () => {
    expect(mayPlay('success', 0, {}, MAX_VOICES)).toBe(false);
    expect(mayPlay('success', 0, {}, MAX_VOICES - 1)).toBe(true);
  });
});
