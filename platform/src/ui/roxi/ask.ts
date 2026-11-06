/** The event a page dispatches to open Roxi with a request already said ("¿Qué necesitas hoy?"). */
export const ROXI_ASK_EVENT = 'roxi:ask';

export function askRoxi(text: string): void {
  window.dispatchEvent(new CustomEvent(ROXI_ASK_EVENT, { detail: { text } }));
}
