/**
 * Drafts Roxi prepares for a form, held in the browser until the form takes
 * them: the fields Roxi wrote and the photos the member sent it.
 *
 * In memory on purpose. Photos are File objects (they cannot go into storage
 * without being copied), a draft is meant for the next few seconds, and
 * nothing here should outlive the tab. The form still has to be sent by the
 * member, and the server checks it like any other.
 */

export const ROXI_FORMS = ['mercadito_listing', 'community_post', 'prayer_request', 'service_request', 'lost_pet', 'found_pet'] as const;
export type RoxiForm = (typeof ROXI_FORMS)[number];

export type RoxiDraft = { form: RoxiForm; fields: Record<string, string | boolean>; files: File[] };

const drafts = new Map<RoxiForm, RoxiDraft>();
const listeners = new Set<() => void>();

export function putDraft(draft: RoxiDraft): void {
  drafts.set(draft.form, draft);
  for (const listener of listeners) listener();
}

/** Hands a waiting draft to its form, once. */
export function takeDraft(form: RoxiForm): RoxiDraft | null {
  const draft = drafts.get(form) ?? null;
  drafts.delete(form);
  return draft;
}

export function onDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
