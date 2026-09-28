'use client';

import { useEffect, useState } from 'react';

/**
 * A listing's photographs: one large, the rest as thumbnails that bring it
 * forward. Arrow keys move through them while the gallery has focus.
 * Without JavaScript the first photo shows and the thumbnails open each
 * image on its own.
 */
export function Gallery({
  photos,
  altFor,
}: {
  photos: Array<{ mediaId: string; width: number; height: number }>;
  /** Pre-translated alternative text, one per photo. */
  altFor: string[];
}) {
  const [index, setIndex] = useState(0);
  const count = photos.length;

  useEffect(() => {
    // Warm the cache so switching is instant on a slow connection.
    for (const photo of photos.slice(1)) {
      const image = new Image();
      image.src = `/media/${photo.mediaId}`;
    }
  }, [photos]);

  if (count === 0) return null;
  const current = photos[index]!;

  return (
    <div
      className="mk-gallery"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
        if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
      }}
    >
      <div className="main">
        {/* eslint-disable-next-line @next/next/no-img-element -- sized by the media pipeline */}
        <img key={current.mediaId} src={`/media/${current.mediaId}`} width={current.width} height={current.height} alt={altFor[index] ?? ''} />
        {count > 1 ? <span className="mk-gallery-count">{`${index + 1} / ${count}`}</span> : null}
      </div>
      {count > 1 ? (
        <div className="thumbs">
          {photos.map((photo, i) => (
            <a
              key={photo.mediaId}
              href={`/media/${photo.mediaId}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                setIndex(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- sized by the media pipeline */}
              <img src={`/media/${photo.mediaId}`} loading="lazy" alt={altFor[i] ?? ''} />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
