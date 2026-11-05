import type { Translator } from '@/i18n';
import type { PlaceHit } from '@/server/domains/geography/places';

/** Said above a list that was widened past the chosen place because nothing was there yet. */
export function WidenedNote({ t, chosen, widenedTo }: { t: Translator; chosen: PlaceHit | null; widenedTo: PlaceHit | null }) {
  if (!chosen || !widenedTo) return null;
  return (
    <p className="mk-banner" role="status">
      {t('place.widened', { place: chosen.name, wider: widenedTo.name })}
    </p>
  );
}
