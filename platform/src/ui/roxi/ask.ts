/** The event a page dispatches to open Roxi with a request already said ("¿Qué necesitas hoy?"). */
export const ROXI_ASK_EVENT = 'roxi:ask';

export function askRoxi(text: string): void {
  window.dispatchEvent(new CustomEvent(ROXI_ASK_EVENT, { detail: { text } }));
}

/**
 * The event a page dispatches to hand Roxi a photo the member just chose on
 * that page (photo-button.tsx): she opens and takes it as if it had been
 * picked in her panel. The file is chosen on the page itself, inside the tap,
 * because a browser opens its file picker only from a tap.
 */
export const ROXI_PHOTO_EVENT = 'roxi:photo';

export type RoxiPhotoHandoff = { file: File; selling: boolean; caption?: string };

export function giveRoxiPhoto(handoff: RoxiPhotoHandoff): void {
  window.dispatchEvent(new CustomEvent<RoxiPhotoHandoff>(ROXI_PHOTO_EVENT, { detail: handoff }));
}
