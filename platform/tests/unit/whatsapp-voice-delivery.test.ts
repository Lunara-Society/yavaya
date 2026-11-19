import { describe, expect, it } from 'vitest';
import { audioSeconds, estimateSeconds, forSpeech, spokenWords, withoutCues, wordsFor } from '@/server/domains/whatsapp/voice-delivery';
import { speechNotes } from '@/server/domains/whatsapp/region';
import { WHATSAPP_RULES } from '@/config/business-rules';

/** The note the owner approved on 15 November (38 spoken words, 14.3 seconds as recorded). */
const APPROVED =
  '[warmly] [slowly] Hola, Suhey… soy Roxi, la asistente de Johan. [short pause] Mira… me pidió que te avisara que ya va de regreso a casa. [thoughtful] Llega en… unos veinte minutitos, más o menos. [cheerful] Así que ya casi está ahí, ¿eh? ¡Nos vemos!';

/** One Ogg page header (RFC 3533) carrying `granule`, with `body` as its only segment. */
function page(granule: bigint, body: Buffer, flags = 0): Buffer {
  const header = Buffer.alloc(27);
  header.write('OggS', 0, 'latin1');
  header[4] = 0; // version
  header[5] = flags;
  header.writeBigUInt64LE(granule, 6);
  header[26] = 1; // one segment
  return Buffer.concat([header, Buffer.from([body.length]), body]);
}

function opusHead(preSkip: number): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = 1;
  head.writeUInt16LE(preSkip, 10);
  return head;
}

describe("Roxi's voice notes, as the voice gets them", () => {
  it('lose dead air at the start and end, and a cue that would colour nothing', () => {
    expect(forSpeech('[short pause] [warmly] Hola, Suhey… [pause]')).toBe('[warmly] Hola, Suhey.');
    expect(forSpeech('¡Nos vemos! [cheerful]')).toBe('¡Nos vemos!');
    expect(forSpeech('Llega en veinte minutos… [long pause] …')).toBe('Llega en veinte minutos.');
    expect(forSpeech('[warmly] [warmly] Hola')).toBe('[warmly] Hola.');
  });

  it('keep everything in the middle as she wrote it', () => {
    expect(forSpeech(APPROVED)).toBe(APPROVED);
  });

  it('count spoken words, never the cues', () => {
    expect(spokenWords(APPROVED)).toBe(38);
    expect(withoutCues(APPROVED)).toBe('Hola, Suhey… soy Roxi, la asistente de Johan. Mira… me pidió que te avisara que ya va de regreso a casa. Llega en… unos veinte minutitos, más o menos. Así que ya casi está ahí, ¿eh? ¡Nos vemos!');
    // Written replies keep their lines.
    expect(withoutCues('[warmly] Hola\nTe cuento')).toBe('Hola\nTe cuento');
  });

  it('estimate length from her measured pace, close to how the approved note recorded', () => {
    expect(estimateSeconds(APPROVED, 'es')).toBeCloseTo(14.3, 0);
    // A longer pause is extra time.
    expect(estimateSeconds('Hola [pause] Suhey [long pause] adiós', 'es')).toBeCloseTo(3 / WHATSAPP_RULES.voiceNoteWordsPerSecond.es + 3 * WHATSAPP_RULES.voiceNotePauseSeconds, 5);
    expect(wordsFor(40, 'es')).toBe(Math.round(40 * WHATSAPP_RULES.voiceNoteWordsPerSecond.es));
  });
});

describe('How long a recording runs', () => {
  it('reads an Ogg Opus file from its last page, less the pre-skip', () => {
    const file = Buffer.concat([page(0n, opusHead(312), 2), page(0n, Buffer.from('OpusTags')), page(48_000n, Buffer.alloc(40)), page(48_000n * 12n + 312n + 24_000n, Buffer.alloc(40), 4)]);
    expect(audioSeconds({ audio: file, mime: 'audio/ogg' })).toBeCloseTo(12.5, 5);
  });

  it('skips a last page without a position, and gives nothing for what is not Ogg', () => {
    const file = Buffer.concat([page(0n, opusHead(0), 2), page(96_000n, Buffer.alloc(10)), page(0xffff_ffff_ffff_ffffn, Buffer.alloc(10))]);
    expect(audioSeconds({ audio: file, mime: 'audio/ogg' })).toBe(2);
    expect(audioSeconds({ audio: Buffer.from('not audio at all, really not'), mime: 'audio/ogg' })).toBeNull();
  });

  it('times an MP3 by its size at the bit rate asked for', () => {
    expect(audioSeconds({ audio: Buffer.alloc(8_000 * 3), mime: 'audio/mpeg' })).toBe(3);
  });
});

describe('How people talk where a number is from', () => {
  it('lets her use vos and local words only as they fit, and stays neutral when nothing is known', () => {
    const nica = speechNotes({ name: 'Nicaragua', speech: { voseo: true, expressions: ['ahorita', 'fijate'] } });
    expect(nica).toContain('From Nicaragua.');
    expect(nica).toContain('use vos only if this person does');
    expect(nica).toContain('ahorita, fijate');
    expect(speechNotes({ name: 'Panamá', speech: { voseo: false, expressions: [] } })).toBe('From Panamá. No local expressions noted: neutral Latin American Spanish.');
    expect(speechNotes(null)).toContain('neutral Latin American Spanish');
  });
});
