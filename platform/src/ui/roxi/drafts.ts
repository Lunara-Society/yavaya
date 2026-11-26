/**
 * Drafts Roxi prepares for a form, held in the browser until the form takes
 * them: the fields Roxi wrote and the photos the member sent it.
 *
 * In memory on purpose. Photos are File objects (they cannot go into storage
 * without being copied), a draft is meant for the next few seconds, and
 * nothing here should outlive the tab. The form still has to be sent by the
 * member, and the server checks it like any other.
 */

export const ROXI_FORMS = ['mercadito_listing', 'community_post', 'prayer_request', 'service_request', 'lost_pet', 'found_pet', 'job_post', 'work_profile', 'board_post'] as const;
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

/**
 * A draft Roxi prepared in the Yavaya app. The app's web view sets it on the
 * window before the form's page loads (it has no photos: those stay on the
 * phone), and it is adopted here once, like any other draft, for the form to
 * take. Anything that is not a known form with plain text or yes/no fields is
 * ignored: the page treats it as the member typing, nothing more.
 */
function adoptAppDraft(): void {
  if (typeof window === 'undefined') return;
  const holder = window as unknown as { __YAVAYA_APP_DRAFT__?: unknown };
  const handed = holder.__YAVAYA_APP_DRAFT__ as { form?: unknown; fields?: unknown } | undefined;
  delete holder.__YAVAYA_APP_DRAFT__;
  if (!handed || typeof handed.form !== 'string' || !(ROXI_FORMS as readonly string[]).includes(handed.form)) return;
  if (!handed.fields || typeof handed.fields !== 'object') return;
  const fields = Object.fromEntries(
    Object.entries(handed.fields as Record<string, unknown>).filter(
      (entry): entry is [string, string | boolean] => typeof entry[1] === 'boolean' || (typeof entry[1] === 'string' && entry[1].length <= 4000),
    ),
  );
  putDraft({ form: handed.form as RoxiForm, fields, files: [] });
}

adoptAppDraft();
