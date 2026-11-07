/**
 * Wall-clock times in a member's own time zone.
 *
 * Roxi hears "mañana a las 8" and writes `2026-11-08T08:00:00` — a time with
 * no zone. That string used to be turned into an instant by the *browser*,
 * with the browser's clock: a member whose Yavaya place is Managua but whose
 * computer said UTC−8 got a reminder at 16:00 UTC, which My things then
 * showed, correctly, as 10:00 in Managua. A time without a zone means the
 * member's Yavaya time (memberClock), decided here, on the server, once.
 *
 * Pure functions on the Intl data the runtime carries; no zone library.
 */

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const HAS_ZONE = /(?:[zZ]|[+-]\d\d:?\d\d)$/;

/** The zone's offset from UTC, in minutes, at a given instant (Managua: −360). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant a written time means. With a zone (`Z`, `-06:00`) it is taken
 * as written; without one it is that wall-clock time in `timeZone`. Null when
 * the string is not a date and time at all.
 */
export function wallTimeToInstant(value: string, timeZone: string): Date | null {
  const text = value.trim();
  if (HAS_ZONE.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = NAIVE.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  try {
    // Two passes: the offset at the first guess can differ from the offset at
    // the answer when a daylight-saving change falls between them.
    const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
    return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60_000);
  } catch {
    return new Date(guess);
  }
}

/** `2026-11-08 08:00` — an instant as the wall clock in `timeZone` shows it, for Roxi to read back. */
export function instantToWallTime(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(instant)
      .replace(',', '');
  } catch {
    return instant.toISOString().slice(0, 16).replace('T', ' ');
  }
}
