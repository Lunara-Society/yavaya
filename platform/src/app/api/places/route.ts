import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { majorPlaces, nearestPlace, placeByCode, placeById, searchPlaces, type PlaceHit } from '@/server/domains/geography/places';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9._-]{2,80}$/;

/**
 * Place lookup for the place picker and the location bar.
 *
 * Public and read-only: the list of towns is public knowledge, and the search
 * runs over an in-memory index, so it needs no account and writes nothing —
 * not even a rate-limit row, which would turn every keystroke into a write.
 *
 *   ?q=chin            places whose name matches, best first
 *   ?q=…&settlements=1 towns and cities only (what a form needs)
 *   ?q=…&exact=1       only places named exactly that (is a name one town or several?)
 *   ?id=<uuid> / ?code=<code>   one place, to show a saved choice
 *   ?near=<lat>,<lon>  the nearest town; the coordinate is not stored
 *   (nothing)          the largest cities of each country, as suggestions
 */
export async function GET(request: Request) {
  const { locale, t } = await getTranslator();
  const url = new URL(request.url);
  const shape = (place: PlaceHit) => ({
    id: place.id,
    code: place.code,
    level: place.level,
    name: place.name,
    context: place.context,
    countryCode: place.countryCode,
    currencyCode: place.currencyCode,
    kind: t(`place.kind.${place.tier ?? place.level}` as MessageKey),
  });
  const reply = (places: PlaceHit[], maxAge = 300) =>
    NextResponse.json({ places: places.map(shape) }, { headers: { 'cache-control': `private, max-age=${maxAge}` } });

  const id = url.searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return reply([]);
    const place = await placeById(db(), id, locale);
    return reply(place ? [place] : []);
  }
  const code = url.searchParams.get('code');
  if (code) {
    if (!CODE.test(code)) return reply([]);
    const place = await placeByCode(db(), code, locale);
    return reply(place ? [place] : []);
  }
  const near = url.searchParams.get('near');
  if (near) {
    const [latitude, longitude] = near.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) {
      return reply([]);
    }
    const place = await nearestPlace(db(), { latitude: latitude!, longitude: longitude! }, locale);
    // A position is personal; never let a shared cache keep the answer to one.
    return NextResponse.json({ places: place ? [shape(place)] : [] }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const query = (url.searchParams.get('q') ?? '').slice(0, 60);
  if (!query.trim()) return reply(await majorPlaces(db(), { locale }), 600);
  const country = url.searchParams.get('country');
  return reply(
    await searchPlaces(db(), query, {
      locale,
      settlementsOnly: url.searchParams.get('settlements') === '1',
      countryCode: country && CODE.test(country) ? country : undefined,
      exact: url.searchParams.get('exact') === '1',
    }),
    120,
  );
}
