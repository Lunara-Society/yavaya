/**
 * "The member just published a listing Roxi drafted": said by the listing
 * form, heard by Roxi (roxi-root.tsx), who shows the receipt and tells the
 * conversation (docs/roxi/FLAGSHIP.md).
 *
 * An event for the page that is open, and a note in this tab's storage for
 * when Roxi is not listening yet: the note is taken once, so the receipt
 * appears once.
 */
export const ROXI_PUBLISHED_EVENT = 'roxi:published';
const KEY = 'yavaya.roxi.published';

export function announcePublished(listingId: string): void {
  try {
    window.sessionStorage.setItem(KEY, listingId);
  } catch {
    // Storage blocked: the event alone carries it.
  }
  window.dispatchEvent(new CustomEvent(ROXI_PUBLISHED_EVENT, { detail: { listingId } }));
}

export function takePublished(): string | null {
  try {
    const id = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
