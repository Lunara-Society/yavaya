import { cache } from 'react';
import type { Translator } from '@/i18n';
import { PLACE_RULES } from '@/config/business-rules';
import { db } from '@/server/db/client';
import { placeCountries } from '@/server/domains/geography/places';
import { chosenPlace, PLACE_COOKIE } from '@/server/place-choice';
import { placePickerLabels } from '@/ui/components/place-labels';
import type { LocationBarLabels } from './location-bar';

/**
 * The visitor's chosen place and the countries to choose from — read once per
 * request, however many location controls the page shows (the header's, and
 * on the home page the search's too). The location bar is a convenience: if
 * places cannot be read, the page still renders, without a choice.
 */
export const placeChoice = cache(async (locale: string) => {
  const [place, countries] = await Promise.all([chosenPlace(locale).catch(() => null), placeCountries(db(), locale).catch(() => [])]);
  return { place, countries };
});

/** Everything a LocationBar needs, the same wherever it is placed: one choice, one cookie. */
export async function locationBarProps(t: Translator, locale: string) {
  const { place, countries } = await placeChoice(locale);
  const labels: LocationBarLabels = {
    label: t('place.bar.label'),
    everywhere: t('place.bar.everywhere'),
    title: t('place.bar.title'),
    intro: t('place.bar.intro'),
    useLocation: t('place.bar.use_location'),
    locating: t('place.bar.locating'),
    locationFailed: t('place.bar.location_failed'),
    countries: t('place.bar.countries'),
    close: t('place.bar.close'),
    privacy: t('place.bar.privacy'),
    picker: placePickerLabels(t),
  };
  return {
    labels,
    initial: place ? { code: place.code, name: place.name, context: place.context } : null,
    countries: countries.map((country) => ({ code: country.code, name: country.name })),
    cookieName: PLACE_COOKIE,
    maxAgeSeconds: PLACE_RULES.choiceCookieSeconds,
  };
}
