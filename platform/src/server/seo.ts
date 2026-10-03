import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { locations } from '@/server/db/schema';

/** The one public origin. Every canonical URL, sitemap entry and share card uses it. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? 'https://yavaya.lat').replace(/\/$/, '');
}

/** The countries Yavaya serves, from the geography rows: never a list in code. */
export async function servedCountryNames(): Promise<string[]> {
  try {
    const rows = await db()
      .select({ name: locations.name })
      .from(locations)
      .where(and(eq(locations.level, 'country'), sql`${locations.isoCode} is not null`));
    return rows.map((row) => row.name).sort();
  } catch {
    return [];
  }
}
