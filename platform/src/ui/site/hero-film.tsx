'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The market at sunset, alive: a seven-second establishing shot (720×960, no
 * sound). It was made from the same illustration as the still and cut to the
 * same rectangle as the phone crop (market-tall), with the still's grade, so
 * its first frame is the still: the picture starts to move rather than being
 * replaced.
 */
export const HERO_FILM = '/art/market-film-720.mp4';

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/**
 * Whether this visit gets the film. Only on a phone-width screen (the film is
 * the upright crop), never with reduced motion, and never where it would cost
 * the member data they did not ask to spend: data saver on, or a link slower
 * than 4G. A browser that does not say (most iPhones) is treated as fast.
 */
function welcome(): boolean {
  if (!window.matchMedia('(max-width: 699px)').matches) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return false;
  return !connection?.effectiveType || connection.effectiveType === '4g';
}

/**
 * The home page's market, alive: the street moves past, the couple walks on
 * towards the church, and the shot slows to rest on its last frame. It plays
 * once, like the opening shot of a film — a forward move cannot loop without
 * the street jumping back, and a picture that keeps moving under the title
 * stops being calm.
 *
 * It loads only once the page has finished, so the still underneath stays the
 * first thing painted (and the page's largest paint); it fades in over that
 * same picture once it is actually playing, and pauses while it is scrolled
 * out of view. If the browser refuses to play it (low-power mode does), the
 * still simply stays.
 */
export function HeroFilm() {
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!welcome()) return;
    let timer: number | undefined;
    const start = () => {
      timer = window.setTimeout(() => setWanted(true), 1200);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!wanted || !video) return;
    // Autoplay is allowed only while muted; set the property as well as the attribute React renders.
    video.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      // play() on a film that has ended starts it again from the first frame: once it has come to rest, it stays there.
      if (video.ended) return observer.disconnect();
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [wanted]);

  if (!wanted) return null;
  return (
    <video
      ref={ref}
      className={playing ? 'hm-film is-playing' : 'hm-film'}
      src={HERO_FILM}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
    />
  );
}
