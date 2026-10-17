import { describe, expect, it } from 'vitest';
import { dailyEs } from '@/i18n/daily/es';
import { dailyEn } from '@/i18n/daily/en';
import { DAILY_KINDS, dailyLight, dailyOrder, dayOfYear, lightDate } from '@/i18n/daily';

describe('daily light', () => {
  it('has 365 texts, one per day, the same count in both languages', () => {
    const total = DAILY_KINDS.reduce((sum, kind) => sum + dailyEs[kind].length, 0);
    expect(total).toBe(365);
    for (const kind of DAILY_KINDS) expect(dailyEn[kind].length).toBe(dailyEs[kind].length);
  });

  it('never repeats a text within a kind', () => {
    for (const kind of DAILY_KINDS) {
      expect(new Set(dailyEs[kind]).size).toBe(dailyEs[kind].length);
      expect(new Set(dailyEn[kind]).size).toBe(dailyEn[kind].length);
    }
  });

  it('with every kind, gives a different text on every day of the year', () => {
    const seen = new Set<string>();
    const start = Date.UTC(2027, 0, 1);
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      seen.add(dailyLight(date, DAILY_KINDS, 'es').text);
    }
    expect(seen.size).toBe(365);
  });

  it('with only prayers, gives only prayers and still changes every day', () => {
    const a = dailyLight('2027-03-01', ['prayer'], 'es');
    const b = dailyLight('2027-03-02', ['prayer'], 'es');
    expect(a.kind).toBe('prayer');
    expect(b.kind).toBe('prayer');
    expect(a.text).not.toBe(b.text);
    expect(dailyOrder(['prayer'])).toHaveLength(dailyEs.prayer.length);
  });

  it('reads no kinds chosen as all of them', () => {
    expect(dailyLight('2027-05-05', [], 'en')).toEqual(dailyLight('2027-05-05', DAILY_KINDS, 'en'));
  });

  it('serves the same position in both languages', () => {
    const es = dailyLight('2027-07-14', DAILY_KINDS, 'es');
    const en = dailyLight('2027-07-14', DAILY_KINDS, 'en');
    expect(en.kind).toBe(es.kind);
    expect(dailyEn[en.kind].indexOf(en.text as never)).toBe(dailyEs[es.kind].indexOf(es.text as never));
  });

  it('turns the day at 8 in the morning local time, not at midnight', () => {
    // 13:59 UTC is 07:59 in Managua (UTC−6): still yesterday's text.
    expect(lightDate('America/Managua', new Date('2027-02-10T13:59:00Z'), 8, 14)).toBe('2027-02-09');
    expect(lightDate('America/Managua', new Date('2027-02-10T14:00:00Z'), 8, 14)).toBe('2027-02-10');
    // Without a place, the day turns at 14:00 UTC.
    expect(lightDate(null, new Date('2027-02-10T13:00:00Z'), 8, 14)).toBe('2027-02-09');
    expect(lightDate(null, new Date('2027-02-10T15:00:00Z'), 8, 14)).toBe('2027-02-10');
  });

  it('counts days of the year from zero, including the leap day', () => {
    expect(dayOfYear('2027-01-01')).toBe(0);
    expect(dayOfYear('2027-12-31')).toBe(364);
    expect(dayOfYear('2028-12-31')).toBe(365);
    expect(() => dailyLight('2028-12-31', DAILY_KINDS, 'es')).not.toThrow();
  });
});
