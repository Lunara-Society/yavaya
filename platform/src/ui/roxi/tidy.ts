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
