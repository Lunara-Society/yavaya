/**
 * The First Light's pictures, all under /public/first-light, each in AVIF and
 * WebP at the widths below (tests/unit/image-files.test.ts checks every file
 * a srcset offers exists).
 *
 * The Guardian is the owner's approved artwork, separated from its sky
 * without retouching (docs/FIRST-LIGHT.md, "The Guardian"): two wings, the
 * body and the tail, which put back together are the original picture, plus
 * two light maps — its brightest gold feathers and its violet ones — that the
 * page lights on its own. The horizon and the seven doorways are illustrative
 * scenes made for Yavaya.
 */
import type { DistrictId } from '@/ui/site/blocks';

export const FL_PATH = '/first-light';

/** Square, 1240×1240 at the largest. */
export const GUARDIAN_WIDTHS = [560, 840, 1240] as const;
export const GUARDIAN_PARTS = ['wing-l', 'wing-r', 'tail', 'body'] as const;
export const GUARDIAN_LIGHTS = ['glint-gold', 'glint-violet'] as const;
export type GuardianPart = (typeof GUARDIAN_PARTS)[number];

/**
 * Which Guardian the page shows (the owner's "guardian" switch). `second` is
 * the owner's new artwork of 6 November 2026, wings spread: the same four
 * parts, cut from its sky by tools/cinematic/guardian2_layers.py so that,
 * stacked, they are the cut-out exactly. The owner asked that not the
 * slightest detail of it change, so the page paints no light onto it: no
 * light maps, no passing band, no glow on the eye. It only moves.
 */
export type GuardianVersion = 'first' | 'second';
export const GUARDIAN_FILE: Record<GuardianVersion, string> = { first: 'guardian', second: 'guardian2' };

/** 16:9 for a wide screen; the 9:16 centre of the same picture for a phone. */
export const HORIZON_WIDTHS = [960, 1600, 2560] as const;
export const HORIZON_TALL_WIDTHS = [640, 960, 1215] as const;

/** 2:3, the picture inside each district's doorway. */
export const DOOR_WIDTHS = [480, 720, 960] as const;
/** Height of a doorway picture for each width (2:3, rounded as the files are). */
export const DOOR_HEIGHT: Record<(typeof DOOR_WIDTHS)[number], number> = { 480: 723, 720: 1084, 960: 1446 };

/** Doorways whose picture has people in it, however small: those carry the "Ilustración" note. */
export const DOORS_WITH_PEOPLE: ReadonlySet<DistrictId> = new Set<DistrictId>(['mercadito', 'community']);

/** Each district's own light: its door's arch on the First Light, and the light of its world. */
export const DISTRICT_LIGHT: Record<DistrictId, string> = {
  mercadito: '#e9b949',
  services: '#4cb5f0',
  work: '#ec5d7c',
  yavayago: '#2fc6c4',
  community: '#b48cff',
  sanctuary: '#f2c46b',
  animals: '#7fd36a',
};

/**
 * The world behind each door (district-world.tsx): a wide strip of the door's
 * own picture, enlarged twice (Real-ESRGAN) so it stays sharp across a wide
 * screen. `top` and `height` say where the strip lies in the door's picture,
 * as fractions of its height, so the door can open exactly onto it (engine.tsx).
 */
export const WORLD_WIDTHS = [800, 1280, 1920, 2720] as const;
/** Districts whose own page is light: their world does not darken into night at its foot. */
export const WORLD_LIGHT_BELOW: ReadonlySet<DistrictId> = new Set<DistrictId>(['sanctuary']);
export const WORLD_SIZE = { width: 2720, height: 1280 } as const;
export const WORLD_CROP: Record<DistrictId, { top: number; height: number }> = {
  mercadito: { top: 0.3936, height: 0.3125 },
  services: { top: 0.3936, height: 0.3125 },
  work: { top: 0.4438, height: 0.3125 },
  yavayago: { top: 0.4438, height: 0.3125 },
  community: { top: 0.4438, height: 0.3125 },
  sanctuary: { top: 0.3438, height: 0.3125 },
  animals: { top: 0.4639, height: 0.3125 },
};

export type ImageFormat = 'avif' | 'webp';

export function flSrcSet(name: string, widths: readonly number[], format: ImageFormat): string {
  return widths.map((width) => `${FL_PATH}/${name}-${width}.${format} ${width}w`).join(', ');
}

export function flSrc(name: string, width: number, format: ImageFormat = 'webp'): string {
  return `${FL_PATH}/${name}-${width}.${format}`;
}

/** Every file the page can ask for, for the image test. */
export function firstLightFiles(districts: readonly DistrictId[]): string[] {
  const formats: ImageFormat[] = ['avif', 'webp'];
  return [
    ...[...GUARDIAN_PARTS, ...GUARDIAN_LIGHTS].flatMap((part) => GUARDIAN_WIDTHS.flatMap((w) => formats.map((f) => `first-light/guardian-${part}-${w}.${f}`))),
    ...GUARDIAN_PARTS.flatMap((part) => GUARDIAN_WIDTHS.flatMap((w) => formats.map((f) => `first-light/guardian2-${part}-${w}.${f}`))),
    ...HORIZON_WIDTHS.flatMap((w) => formats.map((f) => `first-light/horizon-${w}.${f}`)),
    ...HORIZON_TALL_WIDTHS.flatMap((w) => formats.map((f) => `first-light/horizon-tall-${w}.${f}`)),
    ...districts.flatMap((id) => DOOR_WIDTHS.flatMap((w) => formats.map((f) => `first-light/door-${id}-${w}.${f}`))),
    ...districts.flatMap((id) => WORLD_WIDTHS.flatMap((w) => formats.map((f) => `first-light/world-${id}-${w}.${f}`))),
  ];
}
