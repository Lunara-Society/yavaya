/**
 * The guide in video: one film per district and the whole guide stitched into one.
 *
 * The videos live in the media bucket under `guide/` (see /api/ops/guide-upload)
 * and are streamed by /video/[file]. Posters and captions are small and ship
 * with the site in /public/guide. The version is part of every file name, so a
 * re-cut gets new names and browsers can cache each file for good.
 */
export const GUIDE_VERSION = 1;

export const GUIDE_KEYS = ['guia', 'mercadito', 'servicios', 'trabajo', 'yavayago', 'comunidad', 'violeta', 'santuario', 'animales', 'confianza'] as const;
export type GuideKey = (typeof GUIDE_KEYS)[number];

/** Running time in seconds, shown before anyone presses play. */
export const GUIDE_SECONDS: Record<GuideKey, number> = {
  guia: 806,
  mercadito: 81,
  servicios: 88,
  trabajo: 84,
  yavayago: 86,
  comunidad: 73,
  violeta: 88,
  santuario: 78,
  animales: 80,
  confianza: 92,
};

/** Where each chapter starts in the full guide, in seconds. */
export const GUIDE_CHAPTERS: { key: GuideKey | 'intro' | 'cierre'; at: number }[] = [
  { key: 'intro', at: 0 },
  { key: 'mercadito', at: 63 },
  { key: 'servicios', at: 140 },
  { key: 'trabajo', at: 223 },
  { key: 'yavayago', at: 303 },
  { key: 'comunidad', at: 385 },
  { key: 'violeta', at: 453 },
  { key: 'santuario', at: 537 },
  { key: 'animales', at: 611 },
  { key: 'confianza', at: 686 },
  { key: 'cierre', at: 773 },
];

export function isGuideKey(value: string): value is GuideKey {
  return (GUIDE_KEYS as readonly string[]).includes(value);
}

export function guideFiles(key: GuideKey) {
  const name = `${key}-v${GUIDE_VERSION}`;
  return {
    /** 1080p, for screens with a mouse. */
    hd: `/video/${name}.mp4`,
    /** 720p, for touch screens: lighter on a phone's data plan. */
    sd: `/video/${name}-720.mp4`,
    poster: `/guide/${name}.jpg`,
    captions: `/guide/${name}.vtt`,
  };
}

/** The bucket key behind a /video/ file name, or null for anything that is not a guide video. */
export function guideObjectKey(file: string): string | null {
  const match = /^([a-z]+)-v(\d+)(-720)?\.mp4$/.exec(file);
  if (!match || !isGuideKey(match[1]!) || Number(match[2]) !== GUIDE_VERSION) return null;
  return `guide/${file}`;
}
