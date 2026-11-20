/**
 * The cookie that says this browser has seen the "Abriendo por etapas" row,
 * so with the districts' first screen on (docs/DISTRICT-FOCUS.md) it is shown
 * once, not on every page. The middleware sets it on the first page a browser
 * loads; the shell reads it. A preference, not an identifier: its value is
 * only "1", and it lasts 30 days.
 */
export const RIBBON_SEEN_COOKIE = 'yv_ribbon';
export const RIBBON_SEEN_MAX_AGE = 60 * 60 * 24 * 30;
