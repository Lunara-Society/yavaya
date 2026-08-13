/**
 * Normalisation helpers.
 *
 * Two forms of an email exist in Yavaya and they are not interchangeable:
 *
 *  - `canonical` — lower-cased and trimmed. This is the login identity and the
 *    address mail is sent to. Uniqueness is enforced on it.
 *  - `signal` — aggressively folded (dots and +tags removed for providers that
 *    ignore them). Used *only* as one input to the duplicate-account risk
 *    score. It is never used for login, never enforced as unique, and never
 *    shown to anyone, because folding is a heuristic and some providers do
 *    treat `a.b@` and `ab@` as different people.
 */

const DOT_FOLDING_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function canonicalEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function signalEmail(input: string): string {
  const canonical = canonicalEmail(input);
  const at = canonical.lastIndexOf('@');
  if (at <= 0) return canonical;

  let local = canonical.slice(0, at);
  const domain = canonical.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_FOLDING_DOMAINS.has(domain)) local = local.replaceAll('.', '');

  return `${local}@${domain}`;
}

export function emailDomain(input: string): string {
  const canonical = canonicalEmail(input);
  const at = canonical.lastIndexOf('@');
  return at > 0 ? canonical.slice(at + 1) : '';
}

/**
 * Normalises a phone number to E.164 given the country's dialing prefix.
 *
 * Deliberately conservative: it strips formatting and applies the country
 * prefix, and rejects anything it cannot confidently interpret rather than
 * guessing. A wrong guess here would send a verification code to a stranger.
 */
export function toE164(raw: string, countryPrefix: string): string | null {
  const digitsOnly = raw.replace(/[^\d+]/g, '');
  if (digitsOnly.length === 0) return null;

  const prefix = countryPrefix.startsWith('+') ? countryPrefix : `+${countryPrefix}`;

  if (digitsOnly.startsWith('+')) {
    const candidate = `+${digitsOnly.slice(1).replace(/\D/g, '')}`;
    return isPlausibleE164(candidate) ? candidate : null;
  }

  const national = digitsOnly.replace(/\D/g, '').replace(/^0+/, '');
  if (national.length === 0) return null;

  const candidate = `${prefix}${national}`;
  return isPlausibleE164(candidate) ? candidate : null;
}

/** E.164 allows at most 15 digits after the `+`, and at least 7 in practice. */
export function isPlausibleE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}

/** Trims and collapses whitespace in a display name. */
export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}
