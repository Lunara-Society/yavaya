import { z } from 'zod';
import { MERCADITO_RULES } from '@/config/business-rules';

/**
 * Listing input rules, shared by the server (authoritative) and the form
 * (for early feedback only — nothing the browser checks is trusted).
 */

export const LISTING_CATEGORIES = [
  'vehicles',
  'real_estate',
  'electronics',
  'services',
  'fashion',
  'home',
  'sports',
  'classifieds',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

/** Up and reachable: shown in the market, contact allowed, editable. */
export const OPEN_STATUSES = ['published', 'reserved'] as const;
/** What anyone may look at: open listings, and sold ones as a record. */
export const PUBLIC_STATUSES = ['published', 'reserved', 'sold'] as const;

export const LISTING_CONDITIONS = ['new', 'like_new', 'used', 'for_parts', 'not_applicable'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

/**
 * "1500", "1,500.50", "1500,50" → minor units. Both separators occur across
 * the launch markets, so a lone comma followed by exactly two digits is read
 * as a decimal comma and any other comma as a thousands separator.
 */
export function parsePriceToMinor(raw: string): number | null {
  let value = raw.trim().replace(/\s/g, '');
  if (!value) return null;
  if (/^\d+,\d{2}$/.test(value)) value = value.replace(',', '.');
  else value = value.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** E.164: a plus, a country code, and 8–15 digits in all. */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

export const listingInputSchema = z.object({
  title: text(MERCADITO_RULES.titleMinLength, MERCADITO_RULES.titleMaxLength, 'mercadito.error.title'),
  // Line breaks are kept in a description; only runs of spaces collapse.
  description: z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(
      z
        .string()
        .min(MERCADITO_RULES.descriptionMinLength, { message: 'mercadito.error.description' })
        .max(MERCADITO_RULES.descriptionMaxLength, { message: 'mercadito.error.description' }),
    ),
  price: z
    .string()
    .transform((value, context) => {
      const minor = parsePriceToMinor(value);
      if (minor === null || minor > MERCADITO_RULES.maxPriceMinor) {
        context.addIssue({ code: 'custom', message: 'mercadito.error.price' });
        return z.NEVER;
      }
      return minor;
    }),
  currency: z.string().regex(/^[A-Z]{3}$/, { message: 'mercadito.error.currency' }),
  category: z.enum(LISTING_CATEGORIES, { message: 'mercadito.error.category' }),
  condition: z.enum(LISTING_CONDITIONS, { message: 'mercadito.error.condition' }),
  locationId: z.string().uuid({ message: 'mercadito.error.location' }),
});

export type ListingInput = z.output<typeof listingInputSchema>;

/** Titles compared for "same seller, same item": case, accents and spacing ignored. */
export function titleFingerprint(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function whatsappLink(phoneE164: string, message: string): string {
  return `https://wa.me/${phoneE164.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
}
