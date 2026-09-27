import { isLocale, type Locale } from '@/i18n/config';

/**
 * Display preference values.
 *
 * Kept separate from `server/preferences.ts` — which reads cookies and headers
 * — so the shapes and guards can be used and tested anywhere, including in the
 * browser bundle and in plain unit tests.
 */

/** `auto` means "follow the device", which is the default. */
export type LanguagePreference = 'auto' | Locale;
export type ThemePreference = 'system' | 'light' | 'dark';

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['auto', 'es', 'en'];
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'auto';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isLanguagePreference(value: string): value is LanguagePreference {
  return value === 'auto' || isLocale(value);
}

export function isThemePreference(value: string): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * The `data-theme` attribute for `<html>`.
 *
 * `system` resolves to null: no attribute is set and the stylesheet follows
 * `prefers-color-scheme`. Emitting `data-theme="system"` would match no CSS
 * rule and silently strand the page in the light palette.
 */
export function themeAttributeFor(preference: ThemePreference): 'light' | 'dark' | null {
  return preference === 'system' ? null : preference;
}
