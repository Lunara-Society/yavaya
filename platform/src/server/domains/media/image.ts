import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MEDIA_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';

/**
 * The image pipeline.
 *
 * An upload is trusted for nothing — not its file name, not the type the
 * browser declared. The first bytes decide what it is; the decoder then has
 * to succeed on it; and what is kept is a fresh WebP encoding of the decoded
 * pixels. Anything riding along in the original — EXIF with GPS coordinates,
 * a camera serial number, a polyglot payload — does not survive, because
 * none of the original file is stored.
 */

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Identifies a file by its signature, ignoring whatever it claims to be. */
export function sniffImageType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export type ProcessedImage = {
  body: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
  sourceSha256: string;
};

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw errors.validation('media.error.empty');
  if (input.length > MEDIA_RULES.maxUploadBytes) {
    throw errors.validation('media.error.too_large', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 });
  }
  if (!sniffImageType(input)) throw errors.validation('media.error.unsupported_type');

  try {
    // `rotate()` with no argument applies the EXIF orientation to the pixels
    // first, so a portrait phone photo stays upright once EXIF is dropped.
    // sharp writes no metadata unless asked to, and it is never asked here.
    const { data, info } = await sharp(input, {
      limitInputPixels: MEDIA_RULES.maxInputPixels,
      failOn: 'error',
      animated: false,
    })
      .rotate()
      .resize({
        width: MEDIA_RULES.maxDimension,
        height: MEDIA_RULES.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: MEDIA_RULES.webpQuality })
      .toBuffer({ resolveWithObject: true });

    return {
      body: data,
      contentType: 'image/webp',
      width: info.width,
      height: info.height,
      sourceSha256: createHash('sha256').update(input).digest('hex'),
    };
  } catch {
    // Corrupt, truncated, or over the pixel limit. The decoder's message is
    // not shown: it would only help someone tune a malicious file.
    throw errors.validation('media.error.unreadable');
  }
}
