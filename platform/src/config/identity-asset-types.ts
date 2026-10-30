/**
 * The design library's vocabulary: its collections, colour families, the
 * shape of an entry, and the helpers that turn an entry into image sources.
 *
 * Kept apart from the manifest (identity-assets.ts) so that code running in
 * the browser — the profile canvas, inside the Studio — can use them without
 * carrying the whole library's list with it: the Studio receives only the
 * entries it shows, from the server.
 */

export const IDENTITY_COLLECTIONS = ['surfaces', 'horizons', 'frames', 'expression', 'professional'] as const;
export type IdentityCollection = (typeof IDENTITY_COLLECTIONS)[number];

export type IdentityAssetKind = 'background' | 'cover' | 'frame' | 'decoration';

/** Colour families the gallery filters by. */
export const IDENTITY_COLOR_FAMILIES = ['gold', 'black', 'blue', 'violet', 'green', 'teal', 'pink', 'red', 'orange', 'white', 'silver', 'bronze'] as const;
export type IdentityColorFamily = (typeof IDENTITY_COLOR_FAMILIES)[number];

export type IdentityAsset = {
  id: string;
  collection: IdentityCollection;
  kind: IdentityAssetKind;
  /** The family of design, for the style filter: 'liquid', 'marble', 'photo', 'landscape', 'ring', 'botanical'… */
  style: string;
  colors: IdentityColorFamily[];
  /** Dominant colours, darkest first, measured from the file. */
  palette: string[];
  /** Extra words search matches, in Spanish and English, beside the design's own name. */
  tags: string[];
  /** The master's measured size. A vector design reports its drawing box. */
  width: number;
  height: number;
  format: 'webp' | 'svg';
  /** The sizes served, smallest first. A vector design is one file. */
  files: Array<{ width: number; url: string }>;
  thumb: string;
  transparent: boolean;
  placement: 'background' | 'cover' | 'avatar-frame' | 'corners' | 'header' | 'border';
  /** Where a phone's narrow crop should centre, in percent. */
  focus: { x: number; y: number };
  /** Frames only: the photo shape the frame is drawn around. */
  frameShape?: 'circle' | 'rounded';
  status: 'published' | 'retired';
  /** Where the file came from, kept so nobody has to guess later. */
  source: 'yavaya-photo' | 'supplied' | 'procedural-shader' | 'procedural-vector';
};

/** `srcset` for a raster design. */
export function assetSrcSet(asset: Pick<IdentityAsset, 'files'>): string {
  return asset.files.map((file) => `${file.url} ${file.width}w`).join(', ');
}

/** The largest file, for places that take one URL. */
export function assetLargest(asset: Pick<IdentityAsset, 'files'>): string {
  return asset.files[asset.files.length - 1]!.url;
}
