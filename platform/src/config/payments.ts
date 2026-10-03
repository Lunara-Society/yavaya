/**
 * Which payment provider serves which country.
 *
 * Coverage is the provider's, not ours: dLocal Go accepts payers only from
 * the countries it is licensed in (its checkout lists them; the same list is
 * the "valid document types" table in its API docs). Stripe takes
 * cards from any country. Codes are ISO 3166-1 alpha-2, matched against
 * `locations.iso_code` — never against a place name.
 *
 * Order matters: the first provider that is configured and covers the
 * member's country is the one offered.
 */
export const PAYMENT_ROUTING: ReadonlyArray<{ provider: string; countries: readonly string[] | 'any' }> = [
  // The owner's choice (October 2026): Stripe for every country. The others
  // stay as fallbacks, used only if Stripe is not configured.
  { provider: 'stripe', countries: 'any' },
  {
    provider: 'dlocalgo',
    countries: ['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'ID', 'KE', 'MX', 'MY', 'NG', 'PA', 'PE', 'PY', 'UY'],
  },
  { provider: 'paypal', countries: 'any' },
];

export function coversCountry(entry: (typeof PAYMENT_ROUTING)[number], countryIso: string | null): boolean {
  if (entry.countries === 'any') return true;
  return countryIso !== null && entry.countries.includes(countryIso);
}
