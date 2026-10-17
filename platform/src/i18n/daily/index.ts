import type { Locale } from '@/i18n/config';
import { dailyEs, type DailyContent, type DailyKind } from './es';
import { dailyEn } from './en';

/**
 * The daily light: one prayer, saying, quote or blessing a day.
 *
 * Nothing is stored per day. The text for a day is a pure function of the
 * date and of which kinds the member wants, so every server agrees on it, a
 * missed scheduler run loses nothing, and changing a preference takes effect
 * at once.
 */

export type { DailyKind };

/** Display order, and the round-robin order of a day's kind. */
export const DAILY_KINDS: readonly DailyKind[] = ['prayer', 'saying', 'quote', 'blessing'];

const CONTENT: Record<Locale, DailyContent> = { es: dailyEs, en: dailyEn };

export type DailyLight = { kind: DailyKind; text: string };

/**
 * The year's running order for these kinds: the first prayer, the first
 * saying, the first quote, the first blessing, then the second of each, and
 * so on. With all four that is 365 entries, each exactly once. With fewer
 * kinds the shorter order repeats through the year, so there is still a new
 * text every morning, just a shorter cycle.
 */
export function dailyOrder(kinds: readonly DailyKind[]): Array<{ kind: DailyKind; index: number }> {
  const chosen = DAILY_KINDS.filter((kind) => kinds.includes(kind));
  const order: Array<{ kind: DailyKind; index: number }> = [];
  const longest = Math.max(0, ...chosen.map((kind) => dailyEs[kind].length));
  for (let index = 0; index < longest; index += 1) {
    for (const kind of chosen) if (index < dailyEs[kind].length) order.push({ kind, index });
  }
  return order;
}

/** Day of the year, 0-based, for an ISO date (`2026-01-01` → 0). */
export function dayOfYear(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.round((Date.UTC(year!, month! - 1, day!) - Date.UTC(year!, 0, 1)) / 86_400_000);
}

/**
 * The text for a "light day" (see `lightDate`). No kinds chosen means all of
 * them: an empty box is read as "I have not chosen", never as "nothing".
 */
export function dailyLight(isoDate: string, kinds: readonly DailyKind[], locale: Locale): DailyLight {
  const order = dailyOrder(kinds.length > 0 ? kinds : DAILY_KINDS);
  const { kind, index } = order[dayOfYear(isoDate) % order.length]!;
  return { kind, text: (CONTENT[locale] ?? dailyEs)[kind][index]! };
}

/**
 * Which day's text is showing: the local date, turning at `localHour`
 * rather than at midnight. Without a timezone the day turns at
 * `fallbackUtcHour` UTC.
 */
export function lightDate(timezone: string | null, now: Date, localHour: number, fallbackUtcHour: number): string {
  if (!timezone) return new Date(now.getTime() - fallbackUtcHour * 3_600_000).toISOString().slice(0, 10);
  const shifted = new Date(now.getTime() - localHour * 3_600_000);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}

export function isDailyKind(value: string): value is DailyKind {
  return (DAILY_KINDS as readonly string[]).includes(value);
}
