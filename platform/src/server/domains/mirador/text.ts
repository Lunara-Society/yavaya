import { MIRADOR_RULES } from '@/config/business-rules';

/**
 * The words on a Mirador video: its caption, and the hashtags taken from it.
 * Pure functions, so they are the same in the upload route, Roxi's tools and
 * the tests.
 */

/** A caption as the member wrote it, tidied: no runs of spaces or blank lines, cut to the limit. */
export function cleanCaption(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MIRADOR_RULES.captionMaxLength);
}

/**
 * The hashtags in a caption and in a list the member typed, lower-cased,
 * without the #, each once, at most the limit. Letters of any alphabet and
 * digits only: "#Comida", "#comida" and "comida" are the same tag.
 */
export function hashtagsOf(caption: string, extra: unknown = []): string[] {
  const words = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!);
  const listed = Array.isArray(extra) ? extra.filter((item): item is string => typeof item === 'string') : typeof extra === 'string' ? extra.split(/[\s,]+/) : [];
  const tags: string[] = [];
  for (const raw of [...words, ...listed]) {
    const tag = raw.replace(/^#/, '').normalize('NFC').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, MIRADOR_RULES.hashtagMaxLength);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MIRADOR_RULES.maxHashtags) break;
  }
  return tags;
}

/** A comment: one paragraph break at most in a row, cut to the limit; empty when nothing is left. */
export function cleanComment(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, MIRADOR_RULES.commentMaxLength);
}
