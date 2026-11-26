/**
 * The app's side of Roxi's drafts (the website's is platform/src/ui/roxi/drafts.ts).
 * A draft waits here until the next website screen opens; that screen hands
 * it to the page before it loads (window.__YAVAYA_APP_DRAFT__), and the
 * website's own form fills itself, exactly as when Roxi works in a browser.
 * The member still reviews and taps publish; nothing is sent from here.
 */
export const ROXI_FORMS = ['mercadito_listing', 'community_post', 'prayer_request', 'service_request', 'lost_pet', 'found_pet', 'job_post', 'work_profile', 'board_post'] as const;
export type RoxiForm = (typeof ROXI_FORMS)[number];

export type AppDraft = { form: RoxiForm; fields: Record<string, string | boolean> };

let pending: AppDraft | null = null;

export function putDraft(draft: { form: RoxiForm; fields: Record<string, string | boolean>; files: unknown[] }): void {
  pending = { form: draft.form, fields: draft.fields };
}

/** Taken once, by the website screen that opens next. */
export function takePendingDraft(): AppDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}

/**
 * Every `<`, escaped in the script so nothing in a draft can close a tag.
 * Matches the "<" in "</script>"; leaves "abc" untouched.
 * Tester: https://regex101.com/?flavor=javascript&regex=%3C&testString=%3C%2Fscript%3E%0Aabc
 */
const ANGLE = /</g;

/** The script the website screen runs before the page loads. JSON is valid JavaScript. */
export function draftScript(draft: AppDraft | null): string {
  if (!draft) return 'true;';
  return `window.__YAVAYA_APP_DRAFT__ = ${JSON.stringify(draft).replace(ANGLE, '\\u003c')}; true;`;
}
