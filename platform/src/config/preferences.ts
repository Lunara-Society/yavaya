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

/**
 * Santuario's pages are a chapel by candlelight — white and soft gold — at
 * any hour (owner's direction, 24 October 2026), so they render in the light
 * theme whatever the member chose. Its colour world is light in both themes;
 * forcing the attribute as well lets every light-theme rule apply there,
 * instead of night rules written for white text drawing it on ivory.
 */
const CANDLELIT_PATHS = ['/sanctuary', '/admin/sanctuary'];

export function isCandlelit(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CANDLELIT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** The attribute a page renders with: the member's choice, except where it is always candlelit. */
export function themeAttributeAt(pathname: string | null | undefined, chosen: 'light' | 'dark' | null): 'light' | 'dark' | null {
  return isCandlelit(pathname) ? 'light' : chosen;
}
