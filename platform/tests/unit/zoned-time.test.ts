import { describe, expect, it } from 'vitest';
import { instantToWallTime, wallTimeToInstant, zoneOffsetMinutes } from '@/server/time/zoned';

describe('wall-clock times in the member\'s zone', () => {
  it('reads a time without a zone as the member\'s own time, whatever the computer says', () => {
    // The report of 7 November: "mañana a las 8" in Managua must be 14:00 UTC, not 16:00.
    expect(wallTimeToInstant('2026-11-08T08:00:00', 'America/Managua')!.toISOString()).toBe('2026-11-08T14:00:00.000Z');
    expect(wallTimeToInstant('2026-11-08T08:00', 'America/Mexico_City')!.toISOString()).toBe('2026-11-08T14:00:00.000Z');
    expect(wallTimeToInstant('2026-11-08 08:00', 'America/Panama')!.toISOString()).toBe('2026-11-08T13:00:00.000Z');
  });

  it('keeps a time that already says its zone', () => {
    expect(wallTimeToInstant('2026-11-08T08:00:00Z', 'America/Managua')!.toISOString()).toBe('2026-11-08T08:00:00.000Z');
    expect(wallTimeToInstant('2026-11-08T08:00:00-06:00', 'Europe/Stockholm')!.toISOString()).toBe('2026-11-08T14:00:00.000Z');
  });

  it('handles a zone with daylight saving on both sides of the change', () => {
    expect(wallTimeToInstant('2026-07-01T08:00', 'Europe/Stockholm')!.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(wallTimeToInstant('2026-12-01T08:00', 'Europe/Stockholm')!.toISOString()).toBe('2026-12-01T07:00:00.000Z');
  });

  it('refuses what is not a date and time', () => {
    expect(wallTimeToInstant('mañana', 'America/Managua')).toBeNull();
    expect(wallTimeToInstant('2026-11-08', 'America/Managua')).toBeNull();
  });

  it('reads an instant back as the member\'s wall clock', () => {
    expect(instantToWallTime(new Date('2026-11-08T14:00:00Z'), 'America/Managua')).toBe('2026-11-08 08:00');
    expect(zoneOffsetMinutes(new Date('2026-11-08T14:00:00Z'), 'America/Managua')).toBe(-360);
  });
});
