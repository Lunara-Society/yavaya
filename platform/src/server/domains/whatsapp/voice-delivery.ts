import { WHATSAPP_RULES } from '@/config/business-rules';

/**
 * Speech delivery for Roxi's WhatsApp voice notes: the layer between the words
 * she wrote and the audio ElevenLabs makes (docs: HANDOFF.md, "Roxi's voice").
 *
 * Her voice (Cristina, from Spain) is fixed in WHATSAPP_RULES.roxiVoices, and
 * what she says is hers (the agent's prompt). This module only tidies the text
 * for the voice and measures time: the model she speaks with (eleven_v4) has
 * no speed setting, so the pace comes from her words, cues and pauses, and the
 * length of a note is known by measuring the audio, not by assuming.
 */

/** A delivery cue such as [warmly] or [short pause]: read by the voice, never spoken or shown. */
const CUE = /\[[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,32}\]/g;
const LONG_PAUSE_CUE = /\[long pause\]/gi;
const PLAIN_PAUSE_CUE = /\[pause\]/gi;

/**
 * The words of a note as the voice gets them. A pause at the very start or end
 * is only silence in the recording (dead air before she speaks, or after she
 * has finished), and a cue at the end colours nothing, so they go; a closing
 * "…" would trail off into silence, so the note ends on its last word. The
 * same cue twice in a row is said once.
 */
export function forSpeech(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  out = out.replace(/(\[[^\]]{2,32}\])(?:\s*\1)+/gi, '$1');
  out = out.replace(/^(?:\s*\[(?:short |long )?pause\]\s*)+/i, '');
  // Trailing cues and trailing "…", in any order, until the note ends on a word.
  for (;;) {
    const next = out.replace(/\s*\[[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,32}\]\s*$/, '').replace(/\s*(?:…|\.{3,})+\s*$/, '');
    if (next === out) break;
    out = next;
  }
  if (out && !/[.!?¡¿"»)]$/.test(out)) out = `${out}.`;
  return out.trim();
}

/** What she says, as people read it: the cues were for her voice only. */
export function withoutCues(text: string): string {
  return text.replace(CUE, ' ').replace(/[ \t]+/g, ' ').replace(/ ([,.;:!?…])/g, '$1').replace(/ *\n */g, '\n').trim();
}

/** The spoken words of a note (cues are not words). */
export function spokenWords(text: string): number {
  return withoutCues(text)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * About how long the note will run, before any audio is made: her measured
 * rate in this style (which already includes her commas, "…" and short
 * pauses), plus the longer pauses she asked for.
 */
export function estimateSeconds(text: string, language: 'es' | 'en'): number {
  const pauses = (text.match(PLAIN_PAUSE_CUE)?.length ?? 0) + 2 * (text.match(LONG_PAUSE_CUE)?.length ?? 0);
  return spokenWords(text) / WHATSAPP_RULES.voiceNoteWordsPerSecond[language] + pauses * WHATSAPP_RULES.voiceNotePauseSeconds;
}

/** How many spoken words fit in `seconds` at her pace: what she aims for when asked for a length. */
export function wordsFor(seconds: number, language: 'es' | 'en'): number {
  return Math.round(seconds * WHATSAPP_RULES.voiceNoteWordsPerSecond[language]);
}

/**
 * How long a recording runs, in seconds, from the file itself.
 *
 * Ogg Opus: the last page's granule position counts 48 kHz samples from the
 * start, less the encoder's pre-skip in the OpusHead packet (RFC 7845), so no
 * decoding is needed. MP3 (only when ElevenLabs returned no Ogg): constant
 * 64 kbit/s as requested (mp3_44100_64), so the size gives the length.
 */
export function audioSeconds(voice: { audio: Buffer; mime: string }): number | null {
  const { audio } = voice;
  if (voice.mime === 'audio/mpeg') return audio.length > 0 ? (audio.length * 8) / 64_000 : null;
  if (audio.length < 27 || audio.subarray(0, 4).toString('latin1') !== 'OggS') return null;
  const head = audio.indexOf('OpusHead', 0, 'latin1');
  const preSkip = head >= 0 && head + 12 <= audio.length ? audio.readUInt16LE(head + 10) : 0;
  // From the end, page by page. A page counts only if its own size table says
  // it ends exactly where the next one starts (or the file ends), so the bytes
  // "OggS" turning up inside the audio are never taken for a page.
  let end = audio.length;
  let at = audio.lastIndexOf('OggS', end - 1, 'latin1');
  while (at >= 0) {
    const segments = at + 27 <= end ? audio[at + 26]! : -1;
    const tableEnd = at + 27 + segments;
    if (audio[at + 4] === 0 && segments >= 0 && tableEnd <= end) {
      let size = 0;
      for (let i = at + 27; i < tableEnd; i += 1) size += audio[i]!;
      if (tableEnd + size === end) {
        const granule = audio.readBigUInt64LE(at + 6);
        // A page where no packet ends has no position (-1): the one before it says.
        if (granule !== 0xffff_ffff_ffff_ffffn) return Math.max(0, (Number(granule) - preSkip) / 48_000);
        end = at;
      }
    }
    at = at > 0 ? audio.lastIndexOf('OggS', at - 1, 'latin1') : -1;
  }
  return null;
}
