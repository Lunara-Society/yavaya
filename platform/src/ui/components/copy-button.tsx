'use client';

import { useState } from 'react';

/**
 * Copies a piece of text and says so. Where the browser refuses the
 * clipboard, it selects the text instead so the person can copy it by hand.
 */
export function CopyButton({ text, label, done, targetId }: { text: string; label: string; done: string; targetId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-line"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          const target = targetId ? document.getElementById(targetId) : null;
          if (target) {
            const range = document.createRange();
            range.selectNodeContents(target);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }}
    >
      {copied ? done : label}
    </button>
  );
}
