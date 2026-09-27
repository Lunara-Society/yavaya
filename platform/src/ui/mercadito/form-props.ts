import 'server-only';
import type { MessageKey, Translator } from '@/i18n';
import { MERCADITO_RULES } from '@/config/business-rules';
import { LISTING_CATEGORIES, LISTING_CONDITIONS } from '@/server/domains/mercadito/rules';
import type { ListingFormLabels } from './listing-form';

/** Translated labels and option lists for the listing form. */
export function listingFormProps(t: Translator, submit: string) {
  const labels: ListingFormLabels = {
    title: t('mercadito.form.title'),
    titleHint: t('mercadito.form.title_hint'),
    description: t('mercadito.form.description'),
    descriptionHint: t('mercadito.form.description_hint'),
    price: t('mercadito.form.price'),
    currency: t('mercadito.form.currency'),
    category: t('mercadito.form.category'),
    condition: t('mercadito.form.condition'),
    location: t('mercadito.form.location'),
    photos: t('mercadito.form.photos'),
    photosHint: t('mercadito.form.photos_hint', { min: MERCADITO_RULES.minPhotos, max: MERCADITO_RULES.maxPhotos }),
    remove: t('mercadito.form.photo_remove'),
    choose: t('mercadito.form.choose'),
    submit,
    preparing: t('mercadito.form.preparing'),
    submitting: t('mercadito.form.submitting'),
    networkError: t('mercadito.form.network_error'),
  };
  return {
    labels,
    maxPhotos: MERCADITO_RULES.maxPhotos,
    categories: LISTING_CATEGORIES.map((value) => ({ value, label: t(`mercadito.category.${value}` as MessageKey) })),
    conditions: LISTING_CONDITIONS.map((value) => ({ value, label: t(`mercadito.condition.${value}` as MessageKey) })),
  };
}
