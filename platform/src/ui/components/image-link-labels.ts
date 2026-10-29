import type { Translator } from '@/i18n';
import type { ImageLinkLabels } from './image-link';

/** The photo-link field's words, resolved on the server so the client carries no dictionary. */
export function imageLinkLabels(t: Translator): ImageLinkLabels {
  return {
    label: t('media.link.label'),
    hint: t('media.link.hint'),
    placeholder: t('media.link.placeholder'),
    add: t('media.link.add'),
    adding: t('media.link.adding'),
    added: t('media.link.added'),
    full: t('media.link.full'),
    network: t('media.link.error.network'),
  };
}
