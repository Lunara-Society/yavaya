/** The event a page dispatches to open Roxi with a request already said ("¿Qué necesitas hoy?"). */
export const ROXI_ASK_EVENT = 'roxi:ask';

export function askRoxi(text: string): void {
  window.dispatchEvent(new CustomEvent(ROXI_ASK_EVENT, { detail: { text } }));
}

/**
 * A photo the member just chose on a page's camera button (photo-button.tsx),
 * waiting for Roxi's panel. The button opens her with the ask event (no
 * text), which her root already listens for, and the panel takes the photo
 * when it opens, or at once through ROXI_PHOTO_EVENT if it is already open.
 * Kept here rather than passed through her root, because the root is on every
 * page and every byte there is paid on every page (scripts/check-budget.mjs).
 * The file is chosen on the page itself, inside the tap, because a browser
 * opens its file picker only from a tap.
 */
export const ROXI_PHOTO_EVENT = 'roxi:photo';

export type RoxiPhotoHandoff = { file: File; selling: boolean; caption?: string };

let waiting: RoxiPhotoHandoff | null = null;

export function giveRoxiPhoto(handoff: RoxiPhotoHandoff): void {
  waiting = handoff;
  askRoxi('');
  window.dispatchEvent(new Event(ROXI_PHOTO_EVENT));
}

/** The photo waiting for the panel, once: taking it clears it. */
export function takeRoxiPhoto(): RoxiPhotoHandoff | null {
  const handoff = waiting;
  waiting = null;
  return handoff;
}
