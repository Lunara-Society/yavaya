import type { Translator } from '@/i18n';

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
  'you',
  'mic_denied',
  'connect_error',
  'photo_sending',
  'photo_text',
  'photo_error',
  'draft_opened',
  'opened',
  'results',
  'no_results',
  'disclosure',
  'privacy',
  'voice_switch',
  'new',
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
