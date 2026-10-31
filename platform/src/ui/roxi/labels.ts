import { createTranslator, type Translator } from '@/i18n';
import { LOCALES, type Locale } from '@/i18n/config';

/**
 * Roxi's interface text, translated on the server and handed to the client
 * in one piece: the panel loads only when a member opens it, and carries no
 * text of its own.
 */
const KEYS = [
  'open',
  'name',
  'role',
  'hello',
  'hello_sub',
  'suggest.sell',
  'suggest.find',
  'suggest.account',
  'suggest.how',
  'sell_caption',
  'thinking',
  'talk',
  'type_placeholder',
  'send',
  'photo',
  'mute',
  'unmute',
  'end',
  'minimize',
  'restore',
  'close',
  'status.connecting',
  'status.listening',
  'status.speaking',
  'status.ready',
  'status.ended',
  'status.paused',
  'activity.searching',
  'activity.preparing',
  'activity.filling',
  'activity.checking',
  'activity.opening',
  'still_working',
  'slow',
  'retry',
  'you',
  'mic_denied',
  'connect_error',
  'photo_sending',
  'photo_text',
  'photo_error',
  'results',
  'disclosure',
  'privacy',
  'voice_switch',
  'new',
  'copy',
  'copied',
  'read_aloud',
  'stop_reading',
  'helpful',
  'not_helpful',
  'feedback_thanks',
  'clear',
  'restored',
  'camera',
  'photo_dark',
  'photo_blurry',
  'photo_small',
  'photo_duplicate',
  'settings',
] as const;

export type RoxiLabels = Record<(typeof KEYS)[number], string>;

export function roxiLabels(t: Translator): RoxiLabels {
  const labels = {} as RoxiLabels;
  for (const key of KEYS) {
    // The greeting keeps its placeholder; the panel puts the member's name in.
    labels[key] = key === 'hello' ? t('roxi.ui.hello', { name: '{name}' }) : t(`roxi.ui.${key}`);
  }
  return labels;
}

/** Text for what lives outside the panel: the settings sheet, the check-in and the simulated call. */
const PRESENCE_KEYS = [
  'settings.title',
  'settings.mode',
  'settings.mode.quiet',
  'settings.mode.quiet_hint',
  'settings.mode.available',
  'settings.mode.available_hint',
  'settings.mode.proactive',
  'settings.mode.proactive_hint',
  'settings.length',
  'settings.length.short',
  'settings.length.normal',
  'settings.length.detailed',
  'settings.speed',
  'settings.speed.slow',
  'settings.speed.normal',
  'settings.speed.fast',
  'settings.quiet_hours',
  'settings.quiet_from',
  'settings.quiet_to',
  'settings.keep',
  'settings.stored',
  'settings.forget',
  'settings.forgotten',
  'settings.save',
  'settings.saved',
  'settings.close',
  'checkin.text',
  'checkin.form',
  'checkin.open',
  'checkin.later',
  'checkin.never',
  'checkin.why',
  'call.title',
  'call.sub',
  'call.answer',
  'call.decline',
  'call.why',
  'call.off',
] as const;

export type RoxiPresenceLabels = Record<(typeof PRESENCE_KEYS)[number], string>;

export function roxiPresenceLabels(t: Translator): RoxiPresenceLabels {
  const labels = {} as RoxiPresenceLabels;
  for (const key of PRESENCE_KEYS) labels[key] = t(`roxi.${key}`);
  return labels;
}

const WELCOME_LABEL_KEYS = ['title', 'play', 'pause', 'again', 'read', 'close', 'tap', 'talk'] as const;
export type RoxiWelcomeLabels = Record<(typeof WELCOME_LABEL_KEYS)[number], string>;

export function roxiWelcomeLabels(t: Translator): RoxiWelcomeLabels {
  const labels = {} as RoxiWelcomeLabels;
  for (const key of WELCOME_LABEL_KEYS) labels[key] = t(`roxi.welcome.${key}`);
  return labels;
}

/**
 * What the panel says when a message is stopped before Roxi can answer it (a
 * guardrail or a dropped connection closed the conversation). It is said in the
 * language the member was writing in, not the site's, so it is sent in both.
 */
export function roxiRefusals(): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, createTranslator(locale)('roxi.ui.refusal')])) as Record<Locale, string>;
}
