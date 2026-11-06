/**
 * A moment as the member reads it: in their own time zone (memberClock in
 * server/domains/roxi/world.ts, from the place they live), never the
 * server's. Pages render on a server that runs in UTC, so a reminder set for
 * 9:00 in Managua printed without a zone read 15:00.
 */
export function inMemberZone(date: Date, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return date.toLocaleString(locale, { ...options, timeZone });
  } catch {
    // A zone the runtime does not know (a bad row): the instant itself, unshifted, rather than nothing.
    return date.toLocaleString(locale, { ...options, timeZone: 'UTC' });
  }
}

/** The member's calendar day of a moment, as YYYY-MM-DD. */
export function memberDay(date: Date, timeZone: string): string {
  try {
    return date.toLocaleDateString('en-CA', { timeZone });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
