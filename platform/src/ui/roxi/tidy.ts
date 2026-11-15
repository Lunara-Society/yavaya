/**
 * Puts back the space a sentence lost.
 *
 * Roxi's words reach the page without the line breaks she wrote (the voice
 * service passes text on as one run), so "…en Nandaime.\nPrecio: 500" arrived
 * as "…en Nandaime.Precio: 500". A space goes back only between a lowercase
 * letter or digit, the end of a sentence and a capital letter or an opening
 * ¿ ¡: a web address (yavaya.lat), a price (3.500) or an abbreviation
 * followed by a lowercase word is left exactly as it was.
 */
const JOINED = /([0-9a-záéíóúüñ)\]"”])([.!?…])(?=[A-ZÁÉÍÓÚÜÑ¿¡])/g;

export function tidyText(text: string): string {
  return text.replace(JOINED, '$1$2 ');
}

/**
 * The same for text Roxi writes into a form: the lost space, and no run of
 * blank lines or trailing spaces a member would have to clean up by hand.
 */
export function tidyField(text: string): string {
  return tidyText(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Roxi's delivery cues, taken out of what is shown. The voice model reads
 * short bracketed cues ("[warmly]", "[laughs softly]", "[short pause]") as
 * how to say the next words; they are for the ear, never for the screen. Only
 * a bracket holding a few plain words is a cue: a bracket with digits or
 * punctuation in it is left alone.
 */
const CUE = /\[[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,32}\]\s*/g;
export function withoutCues(text: string): string {
  return text.replace(CUE, '').replace(/ {2,}/g, ' ').trim();
}
