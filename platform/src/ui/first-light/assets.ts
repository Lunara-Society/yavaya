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

/** 16:9 for a wide screen; the 9:16 centre of the same picture for a phone. */
export const HORIZON_WIDTHS = [960, 1600, 2560] as const;
export const HORIZON_TALL_WIDTHS = [640, 960, 1215] as const;

/** 2:3, the picture inside each district's doorway. */
export const DOOR_WIDTHS = [480, 720, 960] as const;
/** Height of a doorway picture for each width (2:3, rounded as the files are). */
export const DOOR_HEIGHT: Record<(typeof DOOR_WIDTHS)[number], number> = { 480: 723, 720: 1084, 960: 1446 };

/** Doorways whose picture has people in it, however small: those carry the "Ilustración" note. */
export const DOORS_WITH_PEOPLE: ReadonlySet<DistrictId> = new Set<DistrictId>(['mercadito', 'community']);

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
    ...HORIZON_WIDTHS.flatMap((w) => formats.map((f) => `first-light/horizon-${w}.${f}`)),
    ...HORIZON_TALL_WIDTHS.flatMap((w) => formats.map((f) => `first-light/horizon-tall-${w}.${f}`)),
    ...districts.flatMap((id) => DOOR_WIDTHS.flatMap((w) => formats.map((f) => `first-light/door-${id}-${w}.${f}`))),
  ];
}
