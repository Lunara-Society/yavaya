import type { ReactNode } from 'react';

/**
 * A token package as a collectible: its own artwork (one per tier, growing
 * from two coins to a crowned treasure), its own colour, a slow living
 * border. Every figure on it is real — the saving is computed, and "best
 * value" marks the lowest price per token, never an invented popularity.
 */
export type PackView = { key: string; tokens: number; priceMinor: number; currency: string };

export function formatMoney(minor: number, currency: string): string {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

export function TokenPack({
  pack,
  name,
  tokensWord,
  perToken,
  saving,
  bestLabel,
  best,
  index,
  children,
}: {
  pack: PackView;
  name: string;
  tokensWord: string;
  /** Already formatted: "$0.40 por token". */
  perToken: string;
  /** Already formatted, or null when there is nothing saved. */
  saving: string | null;
  bestLabel: string;
  best: boolean;
  /** Position in the list, for the entrance cascade. */
  index: number;
  /** The call to action: a buy form, or a link. */
  children?: ReactNode;
}) {
  return (
    <li className={`tk-pack${best ? ' tk-best' : ''}`} data-tier={pack.key} style={{ ['--i' as string]: index }}>
      {best ? <span className="tk-ribbon">{bestLabel}</span> : null}
      <div className="tk-pack-in">
        <div className="tk-art" aria-hidden="true">
          <img src={`/tokens/${pack.key}.webp`} alt="" width={280} height={280} loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
          <span className="tk-sparkles" />
        </div>
        <p className="tk-name">{name}</p>
        <p className="tk-amount">
          <span className="tk-num">{pack.tokens}</span>
          <span className="tk-word">{tokensWord}</span>
        </p>
        <p className="tk-price">{formatMoney(pack.priceMinor, pack.currency)}</p>
        <p className="tk-per">{perToken}</p>
        {saving ? <p className="tk-save">{saving}</p> : <p className="tk-save tk-save-none" aria-hidden="true">·</p>}
        {children ? <div className="tk-cta">{children}</div> : null}
      </div>
    </li>
  );
}
