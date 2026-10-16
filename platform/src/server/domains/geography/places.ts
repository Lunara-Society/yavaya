import { and, eq, inArray } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations } from '@/server/db/schema';
import { PLACE_RULES } from '@/config/business-rules';
import { haversineKm } from './service';

/**
 * Finding a place by typing a few letters of it.
 *
 * Two thousand towns do not fit in a dropdown, and nobody in Chinandega
 * should scroll past Belize to reach home. The whole list of active places
 * is small (a few hundred kilobytes), so it is held in memory and searched
 * there: no query per keystroke, and accent-insensitive matching without a
 * database extension.
 *
 * Every place carries its department and country in its label, because the
 * same name recurs across the isthmus (there is a San Rafael in four of the
 * seven countries) and a bare name is ambiguous.
 */

export type SizeTier = (typeof PLACE_RULES.sizeTiers)[number]['tier'];

export type PlaceHit = {
  id: string;
  code: string;
  level: string;
  name: string;
  /** "Departamento, País" — the place's surroundings, for telling namesakes apart. */
  context: string;
  countryCode: string;
  currencyCode: string;
  tier: SizeTier | null;
  population: number | null;
};

type Indexed = PlaceHit & { key: string; words: string[]; latitude: number | null; longitude: number | null };

/** Levels someone can be "in": what a listing, a person or an event is placed at. */
export const SETTLEMENT_LEVELS = ['city', 'town', 'village', 'neighborhood'] as const;

const cache = new Map<string, { at: number; places: Indexed[]; byId: Map<string, Indexed>; byCode: Map<string, Indexed> }>();

/** Lower-case, accents and punctuation removed: "Ciudad de Panamá" → "ciudad de panama". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sizeTier(level: string, population: number | null): SizeTier | null {
  // An unknown population says nothing about size; better no tier than a wrong one.
  if (population === null) return null;
  const tier = PLACE_RULES.sizeTiers.find((entry) => entry.level === level && population >= entry.minPopulation);
  return tier?.tier ?? null;
}

function localizedName(row: { name: string; names: unknown }, locale: string): string {
  return (row.names as Record<string, string> | null)?.[locale] ?? row.name;
}

async function index(executor: Executor, locale: string) {
  const cached = cache.get(locale);
  if (cached && Date.now() - cached.at < PLACE_RULES.indexCacheMinutes * 60_000) return cached;

  const rows = await executor
    .select({
      id: locations.id,
      code: locations.code,
      level: locations.level,
      name: locations.name,
      names: locations.names,
      path: locations.path,
      population: locations.population,
      latitude: locations.latitude,
      longitude: locations.longitude,
      currencyCode: locations.currencyCode,
      isSupportedMarket: locations.isSupportedMarket,
    })
    .from(locations)
    .where(and(eq(locations.isActive, true), inArray(locations.level, ['country', 'state', ...SETTLEMENT_LEVELS])));

  const byCode = new Map(rows.map((row) => [row.code, row]));
  const places: Indexed[] = [];
  for (const row of rows) {
    // Only places in a launch country, and their departments and countries, are offered.
    const country = row.level === 'country' ? row : row.path.map((code) => byCode.get(code)).find((node) => node?.level === 'country');
    if (!country?.isSupportedMarket) continue;
    const state = row.path.map((code) => byCode.get(code)).find((node) => node?.level === 'state');
    const name = localizedName(row, locale);
    const context = [state && row.level !== 'state' ? localizedName(state, locale) : null, row.level !== 'country' ? localizedName(country, locale) : null]
      .filter(Boolean)
      .join(', ');
    const key = foldText(name);
    places.push({
      id: row.id,
      code: row.code,
      level: row.level,
      name,
      context,
      countryCode: country.code,
      currencyCode: country.currencyCode ?? 'USD',
      tier: sizeTier(row.level, row.population),
      population: row.population,
      key,
      words: key.split(' '),
      latitude: row.latitude,
      longitude: row.longitude,
    });
  }
  // Bigger places first: when two match equally, the one more people mean wins.
  places.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  const entry = {
    at: Date.now(),
    places,
    byId: new Map(places.map((place) => [place.id, place])),
    byCode: new Map(places.map((place) => [place.code, place])),
  };
  cache.set(locale, entry);
  return entry;
}

function strip(place: Indexed): PlaceHit {
  const { key: _key, words: _words, latitude: _lat, longitude: _lon, ...hit } = place;
  return hit;
}

const LEVEL_WEIGHT: Record<string, number> = { country: 0, state: 1, city: 2, town: 3, village: 4, neighborhood: 5 };

/**
 * Places whose name matches what was typed, best first.
 *
 * Exact name, then name beginning with it, then a word beginning with it,
 * then anywhere in the name; ties go to the bigger place. `settlementsOnly`
 * leaves out departments and countries, for forms that need a town.
 */
export async function searchPlaces(
  executor: Executor,
  query: string,
  options: { locale?: string; settlementsOnly?: boolean; countryCode?: string; limit?: number } = {},
): Promise<PlaceHit[]> {
  const folded = foldText(query);
  if (folded.length < PLACE_RULES.searchMinChars) return [];
  const { places } = await index(executor, options.locale ?? 'es');
  const limit = Math.min(options.limit ?? PLACE_RULES.searchMaxResults, 50);

  const scored: Array<{ place: Indexed; score: number }> = [];
  for (const place of places) {
    if (options.settlementsOnly && !(SETTLEMENT_LEVELS as readonly string[]).includes(place.level)) continue;
    if (options.countryCode && place.countryCode !== options.countryCode) continue;
    let score: number;
    if (place.key === folded) score = 0;
    else if (place.key.startsWith(folded)) score = 1;
    else if (place.words.some((word) => word.startsWith(folded))) score = 2;
    else if (place.key.includes(folded)) score = 3;
    else continue;
    // A department or country named exactly as typed outranks its towns of the same name.
    scored.push({ place, score: score * 10 + (score === 0 ? LEVEL_WEIGHT[place.level] ?? 5 : 0) });
  }
  // Stable sort keeps the population order inside each score.
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(({ place }) => strip(place));
}

export async function placeById(executor: Executor, id: string, locale = 'es'): Promise<PlaceHit | null> {
  const place = (await index(executor, locale)).byId.get(id);
  return place ? strip(place) : null;
}

export async function placeByCode(executor: Executor, code: string, locale = 'es'): Promise<PlaceHit | null> {
  const place = (await index(executor, locale)).byCode.get(code);
  return place ? strip(place) : null;
}

/** The biggest places of each country, for the location bar's suggestions before anything is typed. */
export async function majorPlaces(executor: Executor, options: { locale?: string; perCountry?: number } = {}): Promise<PlaceHit[]> {
  const { places } = await index(executor, options.locale ?? 'es');
  const perCountry = options.perCountry ?? 3;
  const counts = new Map<string, number>();
  const picked: PlaceHit[] = [];
  for (const place of places) {
    if (place.level !== 'city') continue;
    const count = counts.get(place.countryCode) ?? 0;
    if (count >= perCountry) continue;
    counts.set(place.countryCode, count + 1);
    picked.push(strip(place));
  }
  return picked;
}

/**
 * The settlement nearest a coordinate, for "use my location".
 *
 * The coordinate is used for this one lookup and not stored: what is kept is
 * the town chosen, which the person can see and change.
 */
export async function nearestPlace(
  executor: Executor,
  point: { latitude: number; longitude: number },
  locale = 'es',
): Promise<(PlaceHit & { distanceKm: number }) | null> {
  const { places } = await index(executor, locale);
  let best: { place: Indexed; distanceKm: number } | null = null;
  for (const place of places) {
    if (!(SETTLEMENT_LEVELS as readonly string[]).includes(place.level)) continue;
    if (place.latitude === null || place.longitude === null) continue;
    const distanceKm = haversineKm(point.latitude, point.longitude, place.latitude, place.longitude);
    if (!best || distanceKm < best.distanceKm) best = { place, distanceKm };
  }
  // Further than this from any town we know is outside the launch countries.
  if (!best || best.distanceKm > 60) return null;
  return { ...strip(best.place), distanceKm: Math.round(best.distanceKm) };
}

/** For tests and for operations after adding places by hand. */
export function forgetPlaceIndex() {
  cache.clear();
}

/** The launch countries, for the location bar's one-tap choices. */
export async function placeCountries(executor: Executor, locale = 'es'): Promise<PlaceHit[]> {
  const { places } = await index(executor, locale);
  return places
    .filter((place) => place.level === 'country')
    .map(strip)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
