import manifest from './identity-assets.json';

/**
 * The Identity Studio's design library.
 *
 * Every entry is one real file a member can apply — never a contact sheet,
 * never a placeholder. The list is written by `tools/identity-assets/build.mjs`
 * (at the repository root) from the masters it is given: it measures each
 * file, derives the sizes a page needs, reads its dominant colours and writes
 * this manifest, so the dimensions below are measured, not claimed. Adding
 * artwork is a new master and a brief there, then a rebuild — nothing in the
 * Studio changes. `tests/unit/identity-assets.test.ts` checks that every file
 * named here exists and that every design has its name in both languages.
 *
 * Names and descriptions are i18n keys: `identity.asset.<id>` and
 * `identity.asset.<id>.desc`.
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

export const IDENTITY_ASSETS = manifest.assets as IdentityAsset[];

const BY_ID = new Map(IDENTITY_ASSETS.map((asset) => [asset.id, asset]));

/** A published design of the given kind, or null — the only way an id from a member becomes a file. */
export function identityAsset(id: string | null | undefined, kind?: IdentityAssetKind): IdentityAsset | null {
  if (!id) return null;
  const asset = BY_ID.get(id);
  if (!asset || asset.status !== 'published') return null;
  if (kind && asset.kind !== kind) return null;
  return asset;
}

/** `srcset` for a raster design. */
export function assetSrcSet(asset: Pick<IdentityAsset, 'files'>): string {
  return asset.files.map((file) => `${file.url} ${file.width}w`).join(', ');
}

/** The largest file, for places that take one URL. */
export function assetLargest(asset: Pick<IdentityAsset, 'files'>): string {
  return asset.files[asset.files.length - 1]!.url;
}
