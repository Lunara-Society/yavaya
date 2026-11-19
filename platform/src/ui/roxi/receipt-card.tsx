'use client';

import { useEffect, useState } from 'react';
import type { RoxiLabels } from './labels';

/**
 * The receipt after publishing a listing Roxi drafted (docs/roxi/FLAGSHIP.md):
 * where it is, what it cost, how to change it or take it down. Everything on
 * it comes from the server's record of the publish (/api/roxi/receipt), and
 * the panel tells a live conversation the same facts, so Roxi confirms only
 * what happened.
 */
export type RoxiReceipt = {
  id: string;
  title: string;
  price: string;
  status: string;
  cost: number;
  freeLeft: number;
  freeOpenListings: number;
  url: string;
  editUrl: string;
  mineUrl: string;
};

export function RoxiReceiptCard({
  listingId,
  labels,
  onLoaded,
  onGo,
}: {
  listingId: string;
  labels: RoxiLabels;
  /** Once, when the receipt has been read: the panel tells Roxi. */
  onLoaded?: (receipt: RoxiReceipt) => void;
  onGo: (href: string) => void;
}) {
  const [receipt, setReceipt] = useState<RoxiReceipt | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/roxi/receipt?listing=${encodeURIComponent(listingId)}`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ok?: boolean; receipt?: RoxiReceipt } | null) => {
        if (cancelled) return;
        if (body?.ok && body.receipt) {
          setReceipt(body.receipt);
          onLoaded?.(body.receipt);
        } else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // Read once per receipt; the callback is the panel's and may change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  if (failed) return <li className="roxi-msg is-note">{labels['receipt.error']}</li>;
  if (!receipt) return null;

  const link = (href: string, label: string, quiet = false) => (
    <a
      className={`roxi-retry${quiet ? ' is-quiet' : ''}`}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onGo(href);
      }}
    >
      {label}
    </a>
  );

  return (
    <li className="roxi-receipt" role="status">
      <p className="roxi-receipt-head">
        <span aria-hidden="true">✓</span> {labels['receipt.title']}
      </p>
      <p className="roxi-receipt-what">
        <strong>{receipt.title}</strong> · {receipt.price}
      </p>
      <p className="roxi-receipt-cost">{receipt.cost === 0 ? labels['receipt.free'].replace('{left}', String(receipt.freeLeft)) : labels['receipt.cost'].replace('{cost}', String(receipt.cost))}</p>
      <span className="roxi-confirm-actions">
        {link(receipt.url, labels['receipt.see'])}
        {link(receipt.editUrl, labels['receipt.edit'], true)}
        {link(receipt.mineUrl, labels['receipt.mine'], true)}
      </span>
      <p className="roxi-review-fine">{labels['receipt.remove']}</p>
    </li>
  );
}
