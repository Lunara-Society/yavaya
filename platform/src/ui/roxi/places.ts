/**
 * Which town a member meant, from the words they used.
 *
 * Roxi hears "Nandaime"; the listing form needs the location id of that town
 * in Yavaya's own place table. The candidates come from /api/places (towns
 * and cities only). This decides only between them and never guesses:
 *
 *   - one place whose name is what the member said → that place;
 *   - several (two towns share a name) → ask which, listing them;
 *   - none → no place; the member chooses it in the form.
 *
 * "Name, department" narrows a shared name by the place's context. Names are
 * compared without accents or case, because people type "leon" for León.
 */

export type PlaceCandidate = { id: string; name: string; context: string; level: string };

export type PlaceMatch =
  | { kind: 'one'; place: PlaceCandidate }
  | { kind: 'several'; options: PlaceCandidate[] }
  | { kind: 'none' };

/** At most this many options are read back to the member; more is a list, not a question. */
export const MAX_PLACE_OPTIONS = 5;

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchPlace(asked: string, candidates: PlaceCandidate[]): PlaceMatch {
  const [namePart = '', ...rest] = asked.split(',');
  const name = fold(namePart);
  const within = fold(rest.join(' '));
  if (!name) return { kind: 'none' };
  let exact = candidates.filter((place) => fold(place.name) === name);
  if (within) {
    // "San Juan, Rivas": the department (or country) the member added must appear in the place's context.
    const narrowed = exact.filter((place) => fold(place.context).includes(within));
    if (narrowed.length > 0) exact = narrowed;
  }
  // The same place can come back twice (a city also listed as its municipality): one id is one place.
  const unique = [...new Map(exact.map((place) => [place.id, place])).values()];
  if (unique.length === 1) return { kind: 'one', place: unique[0]! };
  if (unique.length > 1) return { kind: 'several', options: unique.slice(0, MAX_PLACE_OPTIONS) };
  return { kind: 'none' };
}
