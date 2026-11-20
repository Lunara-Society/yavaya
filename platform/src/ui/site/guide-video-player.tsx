'use client';

import { useEffect, useRef } from 'react';

/**
 * A district's film (guide-video.tsx). Its poster is set only when the film
 * comes near the screen: a `poster` attribute is fetched at once wherever the
 * film sits, and on a district page the film sits at the bottom, below what
 * most visitors on a phone ever reach. Nothing else loads before play either
 * (`preload="none"`).
 */
export function GuideVideoPlayer({ id, poster, sd, hd, captions, subtitlesEn, english, labels }: { id?: string; poster: string; sd: string; hd: string; captions: string; subtitlesEn: string; english: boolean; labels: { captions: string; captionsEn: string; unsupported: string } }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      element.poster = poster;
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.poster = poster;
        watch.disconnect();
      },
      { rootMargin: '600px 0px' },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, [poster]);
  return (
    <video ref={video} id={id} className="gv-video" controls preload="none" playsInline>
      <source src={sd} type="video/mp4" media="(pointer: coarse)" />
      <source src={hd} type="video/mp4" />
      <track kind="captions" srcLang="es" label={labels.captions} src={captions} />
      <track kind="subtitles" srcLang="en" label={labels.captionsEn} src={subtitlesEn} default={english} />
      {labels.unsupported}
    </video>
  );
}
