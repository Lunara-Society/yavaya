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
