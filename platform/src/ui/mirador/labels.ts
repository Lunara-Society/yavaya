import 'server-only';
import type { MessageKey, Translator } from '@/i18n';
import { FEED_TABS } from '@/server/domains/mirador/feed';
import { LINK_TYPES } from '@/server/domains/mirador/links';
import { MIRADOR_REPORT_CATEGORIES } from '@/server/domains/mirador/videos';
import { MIRADOR_RULES } from '@/config/business-rules';
import type { FeedLabels } from './feed';
import type { UploadLabels } from './upload';

/** Mirador's words for its client components, in the member's language: they never carry a string of their own. */

const FEED_KEYS = [
  'like', 'unlike', 'comments', 'save', 'unsave', 'share', 'more', 'follow', 'following', 'sound_on', 'sound_off', 'play', 'pause',
  'ai', 'why_title', 'why_none', 'report', 'block', 'blocked', 'close', 'send', 'reply', 'comment_placeholder', 'no_comments', 'remove',
  'sign_in', 'copied', 'copy_link', 'whatsapp', 'report_title', 'report_sent', 'report_note', 'loading', 'error', 'empty_title', 'empty_text',
  'upload', 'back', 'needs_place', 'choose_place', 'views', 'end', 'data_saver', 'brand',
] as const;

const WHY = ['following', 'near', 'interest', 'new'] as const;
const ACTIONS = ['view_listing', 'order', 'view_services', 'view_post'] as const;
const LINK_DISTRICTS = ['mercadito', 'yavayago', 'services', 'hogar', 'movilidad', 'salud', 'aprender', 'negocios', 'campo', 'barrio', 'diaspora'] as const;

export function feedLabels(t: Translator): FeedLabels {
  const out = Object.fromEntries(FEED_KEYS.map((key) => [key, t(`mirador.feed.${key}` as MessageKey)])) as Record<(typeof FEED_KEYS)[number], string>;
  return {
    ...out,
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
  'view', 'studio', 'another', 'rights', 'hashtags_found',
] as const;

/** Every refusal the upload can meet, by its key, so the page says the server's reason in the member's words. */
export const MIRADOR_ERRORS = [
  'mirador.error.unavailable', 'mirador.error.not_video', 'mirador.error.too_large', 'mirador.error.too_long', 'mirador.error.too_short', 'mirador.error.part',
  'mirador.error.upload_done', 'mirador.error.upload_limit', 'mirador.error.processing', 'mirador.error.link', 'mirador.error.place', 'mirador.error.slow_down',
] as const;

export function uploadLabels(t: Translator): UploadLabels {
  const out = Object.fromEntries(
    UPLOAD_KEYS.map((key) => [key, t(`mirador.upload.${key}` as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024) })]),
  ) as Record<(typeof UPLOAD_KEYS)[number], string>;
  return {
    ...out,
    linkKinds: Object.fromEntries(LINK_TYPES.map((type) => [type, t(`mirador.link.${type}` as MessageKey)])),
    errors: Object.fromEntries(MIRADOR_ERRORS.map((key) => [key, t(key as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024), min: MIRADOR_RULES.minDurationSeconds })])),
  };
}
