import type { MessageKey } from '@/i18n';

export type LimitsStanding = {
  newSeller: { limited: boolean; used: number; max: number; windowDays: number };
  /** Listings this member has open now. */
  open: number;
  freeOpenListings: number;
  /** Tokens for one listing beyond the free ones; null when paying for more is switched off. */
  cost: number | null;
  /** When the new-account limit stops applying, already written for the reader. */
  until: string;
};

/**
 * Where this member stands, by whichever limit binds now: the new-account one
 * while it lasts, then the free allowance, then what one more costs — or, when
 * paying for more is switched off, that a place has to be freed first (the
 * server refuses the paid listing then, so "it costs a token" would be untrue).
 * The rules are the server's (sellerStanding, pricingRules); this only chooses
 * the sentence that describes them.
 */
export function limitsStanding(standing: LimitsStanding): { key: MessageKey; params: Record<string, string | number> } {
  const { newSeller, open, freeOpenListings: free, cost, until } = standing;
  if (newSeller.limited) {
    return newSeller.used >= newSeller.max
      ? { key: 'mercadito.limits.you_new_full', params: { max: newSeller.max, days: newSeller.windowDays, date: until, free } }
      : { key: 'mercadito.limits.you_new', params: { used: newSeller.used, max: newSeller.max, left: newSeller.max - newSeller.used, date: until } };
  }
  const freeLeft = Math.max(0, free - open);
  if (freeLeft > 0) return { key: 'mercadito.limits.you_free', params: { open, left: freeLeft } };
  if (cost) return { key: 'mercadito.limits.you_paid', params: { open, cost } };
  return { key: 'mercadito.limits.you_full', params: { open } };
}
