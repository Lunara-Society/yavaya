import 'server-only';
import type { MessageKey, Translator } from '@/i18n';
import { FEED_TABS } from '@/server/domains/mirador/feed';
import { LINK_TYPES } from '@/server/domains/mirador/links';
import { MIRADOR_REPORT_CATEGORIES } from '@/server/domains/mirador/videos';
import { MIRADOR_RULES } from '@/config/business-rules';
import type { FeedLabels } from './feed';
import type { OfferLabels, UploadLabels } from './upload';
import { OFFER_CATEGORIES } from '@/server/domains/mirador/offers';

/** Mirador's words for its client components, in the member's language: they never carry a string of their own. */

const FEED_KEYS = [
  'like', 'unlike', 'comments', 'save', 'unsave', 'share', 'more', 'follow', 'following', 'sound_on', 'sound_off', 'play', 'pause',
  'ai', 'why_title', 'why_none', 'report', 'block', 'blocked', 'close', 'send', 'reply', 'comment_placeholder', 'no_comments', 'remove',
  'sign_in', 'copied', 'copy_link', 'whatsapp', 'report_title', 'report_sent', 'report_note', 'loading', 'error', 'empty_title', 'empty_text',
  'upload', 'back', 'needs_place', 'choose_place', 'views', 'end', 'data_saver', 'brand',
  'want', 'want_title', 'want_quantity', 'want_note', 'want_send', 'want_sent', 'want_pending', 'want_accepted', 'want_whatsapp', 'want_whatsapp_message', 'want_less', 'want_more',
  'offer_left', 'offer_sold_out', 'offer_closed', 'offer_until', 'offer_free', 'offer_contribution', 'offer_donation', 'offer_food_notice', 'offer_pay_note', 'offer_ingredients', 'captions',
  'offer_animals', 'offer_need', 'offer_needed', 'offer_verified', 'offer_complete', 'help', 'help_title', 'help_quantity', 'help_send', 'help_sent', 'help_pending', 'help_accepted', 'help_note',
] as const;

/** Refusals a viewer can meet when asking for an offer. */
const WANT_ERRORS = ['mirador.offer.error.own', 'mirador.offer.error.closed', 'mirador.offer.error.not_enough', 'mirador.offer.error.kitchens_only', 'mirador.offer.error.rescuers_only', 'mirador.offer.error.already_accepted', 'mirador.offer.error.quantity', 'mirador.error.slow_down'] as const;

const WHY = ['following', 'near', 'interest', 'new'] as const;
const ACTIONS = ['view_listing', 'order', 'view_services', 'view_post'] as const;
const LINK_DISTRICTS = ['mercadito', 'yavayago', 'services', 'hogar', 'movilidad', 'salud', 'aprender', 'negocios', 'campo', 'barrio', 'diaspora'] as const;

export function feedLabels(t: Translator): FeedLabels {
  // Placeholders the client fills itself ({count}, {time}, {name}, {title}, {url}) pass through as written.
  const keep = { count: '{count}', time: '{time}', name: '{name}', title: '{title}', url: '{url}' };
  const out = Object.fromEntries(FEED_KEYS.map((key) => [key, t(`mirador.feed.${key}` as MessageKey, keep)])) as Record<(typeof FEED_KEYS)[number], string>;
  return {
    ...out,
    // Left with their placeholders: the refusal's details fill them ("only {count} left").
    errors: Object.fromEntries(WANT_ERRORS.map((key) => [key, t(key as MessageKey, { count: '{count}', max: '{max}' })])),
    tabs: Object.fromEntries(FEED_TABS.map((tab) => [tab, t(`mirador.tab.${tab}` as MessageKey)])),
    why: Object.fromEntries(WHY.map((reason) => [reason, t(`mirador.why.${reason}` as MessageKey)])),
    action: Object.fromEntries(ACTIONS.map((action) => [action, t(`mirador.action.${action}` as MessageKey)])),
    reportCategories: Object.fromEntries(MIRADOR_REPORT_CATEGORIES.map((category) => [category, t(`mirador.report.${category}` as MessageKey)])),
    districts: Object.fromEntries(LINK_DISTRICTS.map((district) => [district, t(`district.${district}.name` as MessageKey)])),
  };
}

const UPLOAD_KEYS = [
  'title', 'choose', 'choose_hint', 'caption', 'caption_hint', 'place', 'link', 'link_none', 'publish_when_ready', 'publish', 'save_draft',
  'cancel', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'retry', 'too_long', 'too_large', 'not_video', 'error',
  'view', 'studio', 'another', 'rights', 'hashtags_found', 'photos_ready', 'photos_hint',
] as const;

const OFFER_KEYS = [
  'heading', 'none', 'kind_sale', 'kind_free', 'kind_contribution', 'kind_donation', 'kind_donation_hint', 'what', 'price', 'price_hint', 'unit', 'unit_hint',
  'quantity', 'category', 'ingredients', 'ingredients_hint', 'rules', 'rules_list', 'pickup', 'pickup_hint', 'until', 'place_needed', 'free_note',
  'kind_animals', 'kind_animals_hint', 'kind_need', 'kind_need_hint', 'organisation_link', 'what_need', 'quantity_need', 'pickup_need', 'pickup_need_hint', 'animal_food', 'animal_food_hint',
] as const;

export function offerLabels(t: Translator): OfferLabels {
  return {
    ...(Object.fromEntries(OFFER_KEYS.map((key) => [key, t(`mirador.offer.${key}` as MessageKey, { hours: MIRADOR_RULES.foodMaxHours })])) as Record<(typeof OFFER_KEYS)[number], string>),
    categories: Object.fromEntries(OFFER_CATEGORIES.map((category) => [category, t(`mirador.offer.category.${category}` as MessageKey)])),
    hours: Object.fromEntries(MIRADOR_RULES.offerHours.map((h) => [String(h), t(`mirador.offer.hours.${h}` as MessageKey)])),
  };
}

/** Every refusal the upload can meet, by its key, so the page says the server's reason in the member's words. */
export const MIRADOR_ERRORS = [
  'mirador.error.unavailable', 'mirador.error.not_video', 'mirador.error.too_large', 'mirador.error.too_long', 'mirador.error.too_short', 'mirador.error.part',
  'mirador.error.upload_done', 'mirador.error.upload_limit', 'mirador.error.processing', 'mirador.error.link', 'mirador.error.place', 'mirador.error.slow_down',
  'mirador.error.not_photo', 'mirador.error.photo_count',
  'mirador.offer.error.kind', 'mirador.offer.error.title', 'mirador.offer.error.quantity', 'mirador.offer.error.price', 'mirador.offer.error.place', 'mirador.offer.error.ingredients',
  'mirador.offer.error.food_rules', 'mirador.offer.error.hours', 'mirador.offer.error.too_many', 'mirador.offer.error.quantity_promised', 'mirador.offer.error.helpers_only', 'mirador.offer.error.animal_food',
] as const;

export function uploadLabels(t: Translator): UploadLabels {
  const out = Object.fromEntries(
    UPLOAD_KEYS.map((key) => [key, t(`mirador.upload.${key}` as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024), max: MIRADOR_RULES.maxPhotos })]),
  ) as Record<(typeof UPLOAD_KEYS)[number], string>;
  return {
    ...out,
    linkKinds: Object.fromEntries(LINK_TYPES.map((type) => [type, t(`mirador.link.${type}` as MessageKey)])),
    errors: Object.fromEntries(
      MIRADOR_ERRORS.map((key) => [
        key,
        t(key as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024), min: MIRADOR_RULES.minDurationSeconds, max: key.includes('too_many') ? MIRADOR_RULES.openOffersPerMember : key.includes('hours') ? MIRADOR_RULES.foodMaxHours : key.includes('photo_count') ? MIRADOR_RULES.maxPhotos : MIRADOR_RULES.offerMaxQuantity, count: '' }),
      ]),
    ),
    offer: offerLabels(t),
  };
}
