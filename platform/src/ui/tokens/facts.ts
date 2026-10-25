/**
 * The figures the tokens tables quote, and how a table row is filled from
 * them. Pure: the page fills rows from live prices and settings
 * (server/domains/tokens/uses.ts); Roxi's knowledge script fills the same
 * rows from the defaults, so both say the same thing.
 */
export type TokenFacts = Record<
  | 'mercadito_free'
  | 'listing_cost'
  | 'feature_listing_cost'
  | 'listing_days'
  | 'work_free'
  | 'post_cost'
  | 'feature_post_cost'
  | 'post_days'
  | 'feature_store_cost'
  | 'store_days'
  | 'starter_per_day'
  | 'starter_days'
  | 'inviter_reward'
  | 'invitee_reward'
  | 'invite_month_cap',
  number | null
>;

/**
 * Fills one row: `{listing_cost}` becomes "1 token", `{work_free}` becomes
 * "2". A row naming a figure that is unavailable — a disabled action has no
 * price — comes back null, so a table never quotes a price nobody can be
 * charged.
 */
export function fillTokenRow(row: readonly string[], facts: TokenFacts, cost: { one: string; many: string }): string[] | null {
  const out: string[] = [];
  for (const cell of row) {
    let missing = false;
    const filled = cell.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
      if (!(key in facts)) return whole;
      const value = facts[key as keyof TokenFacts];
      if (value === null) {
        missing = true;
        return whole;
      }
      if (!key.endsWith('_cost')) return String(value);
      return (value === 1 ? cost.one : cost.many).replace('{n}', String(value));
    });
    if (missing) return null;
    out.push(filled);
  }
  return out;
}
