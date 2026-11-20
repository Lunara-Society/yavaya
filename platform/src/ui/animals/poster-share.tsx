'use client';

/**
 * Shares a lost or found animal's poster (app/animals/lost/[id]/poster): on a
 * phone that can share files, the image itself goes to WhatsApp or wherever
 * the member chooses, the way such posters already travel; anywhere else the
 * poster opens to save or forward. The link is the poster, so it works even
 * before the script has loaded.
 */
export function PosterShare({ posterUrl, fileName, text, label }: { posterUrl: string; fileName: string; text: string; label: string }) {
  return (
    <a
      className="btn btn-gold"
      href={posterUrl}
      target="_blank"
      rel="noopener"
      onClick={async (event) => {
        if (typeof navigator.canShare !== 'function') return;
        event.preventDefault();
        try {
          const blob = await (await fetch(posterUrl)).blob();
          const file = new File([blob], fileName, { type: blob.type || 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
          }
        } catch (error) {
          // The member closed the share sheet: nothing else to do.
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
        window.open(posterUrl, '_blank', 'noopener');
      }}
    >
      {label}
    </a>
  );
}
