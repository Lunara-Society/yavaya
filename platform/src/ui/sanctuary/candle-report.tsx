'use client';

import { useState } from 'react';

/** "Reportar lo escrito": whoever received the candle may, without an account. The words are hidden at once. */
export function CandleReport({ id, labels }: { id: string; labels: { report: string; confirm: string; done: string; error: string } }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  if (state === 'done') return <p className="vela-small" role="status">{labels.done}</p>;
  return (
    <p className="vela-small">
      <button
        type="button"
        className="vela-link"
        disabled={state === 'busy'}
        onClick={async () => {
          if (!window.confirm(labels.confirm)) return;
          setState('busy');
          const response = await fetch(`/api/sanctuary/candles/${id}/report`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
          setState(response?.ok ? 'done' : 'failed');
          if (response?.ok) window.setTimeout(() => window.location.reload(), 1200);
        }}
      >
        {labels.report}
      </button>
      {state === 'failed' ? <span role="alert"> {labels.error}</span> : null}
    </p>
  );
}
