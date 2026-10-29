import type { Translator } from '@/i18n';
import type { PlacePickerLabels } from './place-picker';

/** The place picker's words, resolved on the server so the client carries no dictionary. */
export function placePickerLabels(t: Translator, options: { any?: boolean } = {}): PlacePickerLabels {
  return {
    placeholder: t('place.picker.placeholder'),
    empty: t('place.picker.empty'),
    required: t('place.picker.required'),
    clear: t('place.picker.clear'),
    suggested: t('place.picker.suggested'),
    searching: t('place.picker.searching'),
    ...(options.any ? { any: t('place.picker.any') } : {}),
  };
}
