import { describe, expect, it } from 'vitest';
import { haloPose } from '@/ui/roxi/halo';
import { COMPLETED_MS, IDLE_RAW, type RoxiRaw } from '@/ui/roxi/state-bus';

// The Halo only moves for what Roxi is really doing: each pose comes from one fact the panel publishes.
const live: RoxiRaw = { ...IDLE_RAW, available: true, open: true, phase: 'live' };
const now = 1_000_000;

describe("Roxi's Halo", () => {
  it('rests when nothing is happening, and when Roxi is not available', () => {
    expect(haloPose(IDLE_RAW, now)).toBe('resting');
    expect(haloPose(live, now)).toBe('resting');
  });

  it('listens and speaks with the conversation', () => {
    expect(haloPose({ ...live, orb: 'listening' }, now)).toBe('listening');
    expect(haloPose({ ...live, orb: 'speaking' }, now)).toBe('speaking');
  });

  it('thinks while an answer or a look-up is pending', () => {
    expect(haloPose({ ...live, waiting: true }, now)).toBe('processing');
    expect(haloPose({ ...live, phase: 'connecting' }, now)).toBe('processing');
    expect(haloPose({ ...live, activity: 'searching' }, now)).toBe('processing');
    expect(haloPose({ ...live, activity: 'checking' }, now)).toBe('processing');
  });

  it('builds while she writes a draft or fills a form, and carries out while saving or opening', () => {
    expect(haloPose({ ...live, activity: 'preparing' }, now)).toBe('creating');
    expect(haloPose({ ...live, activity: 'filling' }, now)).toBe('creating');
    expect(haloPose({ ...live, activity: 'saving' }, now)).toBe('executing');
    expect(haloPose({ ...live, activity: 'opening' }, now)).toBe('executing');
  });

  it('waits for the member over any work, and shows a problem over everything', () => {
    expect(haloPose({ ...live, activity: 'saving', confirming: true }, now)).toBe('awaiting');
    expect(haloPose({ ...live, confirming: true, problem: true, orb: 'speaking' }, now)).toBe('error');
  });

  it('shows a completed step only for a moment', () => {
    expect(haloPose({ ...live, completedAt: now - 100 }, now)).toBe('completed');
    expect(haloPose({ ...live, completedAt: now - COMPLETED_MS - 1 }, now)).toBe('resting');
  });
});

describe("The Halo's launcher mark", () => {
  it('is the same shape as the live Halo (regenerate public/roxi/halo-mark.svg with haloMarkSvg() if this fails)', async () => {
    const { readFileSync } = await import('node:fs');
    const { haloMarkSvg } = await import('@/ui/roxi/halo-shape');
    expect(readFileSync('public/roxi/halo-mark.svg', 'utf8')).toBe(haloMarkSvg());
  });
});
