import 'server-only';
import { cache } from 'react';
import { db } from '@/server/db/client';
import { memberClock } from '@/server/domains/roxi/world';
import { SITE_STATS_RULES } from '@/config/business-rules';

/**
 * The time zone a page shows times in: the member's own (the country of the
 * place they live, memberClock), or the site's day clock for a visitor or a
 * member with no place. Never the server's: it runs in UTC, and a note sent
 * at 8:00 in Managua was printed as 2:00 PM.
 *
 * Cached per request, so a page that formats many times asks once.
 */
export const viewerTimeZone = cache(async (userId: string | null | undefined): Promise<string> => {
  if (!userId) return SITE_STATS_RULES.dayTimeZone;
  return (await memberClock(db(), userId)).timeZone;
});

/** Intl.DateTimeFormat in a zone, falling back to the site's clock if the zone is unknown to the runtime. */
export function zonedFormat(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: SITE_STATS_RULES.dayTimeZone });
  }
}
