/**
 * The language a member wrote in, for the panel's own line when Roxi cannot
 * answer: Roxi answers in the language of the latest message, so the panel
 * does too. Only the site's languages; a tie keeps the site language.
 */
export function languageOf(text: string, fallback: string): string {
  const spanish = (text.match(/[¿¡ñáéíóú]|\b(que|de|el|la|los|las|para|por|como|quiero|necesito|hola|mi|tu|una|un|es|esta|cual|dame|dime)\b/gi) ?? []).length;
  const english = (text.match(/\b(the|and|you|your|what|how|is|are|my|i|to|for|please|want|need|hello|me|show|tell|give)\b/gi) ?? []).length;
  return spanish > english ? 'es' : english > spanish ? 'en' : fallback;
}
