/**
 * Quick checks on a photo before it goes to Roxi: too dark, blurry, tiny, or
 * the same photo again. They only advise — the photo is still sent (except an
 * exact repeat) and the member decides. Nothing here edits the photo: a
 * listing must show the item as it is.
 *
 * Pure functions over grey-scale pixels, so they are tested without a canvas.
 */

export type PhotoHint = 'dark' | 'blurry' | 'small';

/** Below this average brightness (0–255) a photo reads as dark. */
const DARK_MEAN = 55;
/** Below this variance of the Laplacian (on a 160 px sample) a photo reads as blurry. */
const BLUR_VARIANCE = 45;
/** Under this many pixels on the long side, details are lost. */
const SMALL_EDGE = 480;

export function luminance(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) grey[j] = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114) / 1000;
  return grey;
}

export function meanBrightness(grey: Uint8ClampedArray): number {
  let sum = 0;
  for (const value of grey) sum += value;
  return grey.length ? sum / grey.length : 0;
}

/** Variance of the 4-neighbour Laplacian: sharp edges give a high value, a blurred image a low one. */
export function laplacianVariance(grey: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let squares = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value = grey[i - width]! + grey[i + width]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += value;
      squares += value * value;
      n++;
    }
  }
  const mean = sum / n;
  return squares / n - mean * mean;
}

/**
 * Difference hash: 8×8 bits from a 9×8 grey sample, comparing neighbours.
 * The same photo sent twice gives the same hash even after re-encoding.
 */
export function differenceHash(grey9x8: Uint8ClampedArray): string {
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += grey9x8[y * 9 + x]! > grey9x8[y * 9 + x + 1]! ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function photoHints(sample: { grey: Uint8ClampedArray; width: number; height: number }, longEdge: number): PhotoHint[] {
  const hints: PhotoHint[] = [];
  if (meanBrightness(sample.grey) < DARK_MEAN) hints.push('dark');
  else if (laplacianVariance(sample.grey, sample.width, sample.height) < BLUR_VARIANCE) hints.push('blurry');
  if (longEdge < SMALL_EDGE) hints.push('small');
  return hints;
}
