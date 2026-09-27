import type { Locale } from '@/i18n/config';
import { siteEs, type SiteContent } from './es';
import { siteEn } from './en';

const SITE: Record<Locale, SiteContent> = { es: siteEs, en: siteEn };

/** The website content for a locale. Spanish is the fallback, never English. */
export function siteContent(locale: Locale): SiteContent {
  return SITE[locale] ?? siteEs;
}

export type { SiteContent };
