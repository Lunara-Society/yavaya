'use client';

/** Opens the browser's own print dialog; the page's print styles decide what goes on paper. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-line" onClick={() => window.print()}>
      {label}
    </button>
  );
}
