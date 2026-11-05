import 'server-only';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { placeByCode, type PlaceHit } from '@/server/domains/geography/places';

/**
 * The place chosen in the header's location bar.
 *
 * Kept in a cookie, not on the account: it is a browsing preference that
 * works before sign-in, it says only which town someone is looking at (never
 * where they are standing), and it is set by the browser itself so changing
 * it needs no request. The cookie holds a place code; anything that is not a
 * known active place is ignored.
 */
export const PLACE_COOKIE = 'yav_place';

/** A filter's "anywhere" choice, distinct from no choice, so it overrides the location bar. */
export const ANY_PLACE = 'all';

export async function chosenPlace(locale: string): Promise<PlaceHit | null> {
  const code = (await cookies()).get(PLACE_COOKIE)?.value;
  if (!code || !/^[a-z0-9._-]{2,80}$/.test(code)) return null;
  return placeByCode(db(), code, locale);
}

/**
 * The place a district list is filtered by.
 *
 * An explicit `?place=` wins (`all` meaning everywhere); without one, the
 * list follows the location bar. `link` is what to carry into pagination
 * and filter links so the choice survives them.
 */
export async function browsePlace(param: string | undefined, locale: string): Promise<{ code: string | undefined; link: string | undefined }> {
  if (param === ANY_PLACE) return { code: undefined, link: ANY_PLACE };
  if (param) {
    const place = /^[a-z0-9._-]{2,80}$/.test(param) ? await placeByCode(db(), param, locale) : null;
    return { code: place?.code, link: place?.code };
  }
  const chosen = await chosenPlace(locale);
  return { code: chosen?.code, link: chosen?.code };
}

/** A place's wider areas, nearest first: 'ca.ni.gr.nandaime' → 'ca.ni.gr' (Granada), 'ca.ni' (Nicaragua). */
export function widerPlaces(code: string): string[] {
  const parts = code.split('.');
  const wider: string[] = [];
  for (let length = parts.length - 1; length >= 2; length--) wider.push(parts.slice(0, length).join('.'));
  return wider;
}

/**
 * A district list for the chosen place; when there is nothing there, for its
 * department, then its country — and which, so the page can say so. Before,
 * a live listing 60 km away read as "no results" until the member thought to
 * widen the place themselves. Only the first page widens: a later page keeps
 * the area its first page showed (the page links carry it).
 */
export async function widenWhenEmpty<T extends { items: unknown[] }>(
  code: string | undefined,
  page: number,
  locale: string,
  run: (code: string | undefined) => Promise<T>,
): Promise<{ result: T; chosen: PlaceHit | null; widenedTo: PlaceHit | null }> {
  const first = await run(code);
  if (!code || page > 1 || first.items.length > 0) return { result: first, chosen: null, widenedTo: null };
  for (const wider of widerPlaces(code)) {
    const result = await run(wider);
    if (result.items.length > 0) {
      const [chosen, widenedTo] = await Promise.all([placeByCode(db(), code, locale), placeByCode(db(), wider, locale)]);
      return { result, chosen, widenedTo };
    }
  }
  return { result: first, chosen: null, widenedTo: null };
}
