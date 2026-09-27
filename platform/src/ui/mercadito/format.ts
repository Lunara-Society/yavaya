/** Display formatting for Mercadito. Locale-aware, never hand-built strings. */

const INTL_LOCALE: Record<string, string> = { es: 'es-419', en: 'en-US' };

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? locale;
}

export function formatPrice(minor: number, currency: string, locale: string): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** The price as a seller types it back in, for the edit form. */
export function priceInputValue(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date);
}
