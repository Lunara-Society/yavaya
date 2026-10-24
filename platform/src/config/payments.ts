/**
 * Which payment provider serves which country.
 *
 * Coverage is the provider's, not ours. Codes are ISO 3166-1 alpha-2,
 * matched against `locations.iso_code` — never against a place name.
 *
 * Order matters: the first provider that is configured and covers the
 * member's country is the one offered.
 */
export const PAYMENT_ROUTING: ReadonlyArray<{ provider: string; countries: readonly string[] | 'any' }> = [
  // The owner's choice (October 2026): Stripe, which takes cards from every
  // country, is the only provider. PayPal and dLocal Go were removed at the
  // owner's request: nothing on Yavaya pays through them.
  { provider: 'stripe', countries: 'any' },
];

export function coversCountry(entry: (typeof PAYMENT_ROUTING)[number], countryIso: string | null): boolean {
  if (entry.countries === 'any') return true;
  return countryIso !== null && entry.countries.includes(countryIso);
}
