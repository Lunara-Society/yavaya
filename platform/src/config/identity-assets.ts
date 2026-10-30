import manifest from './identity-assets.json';

/**
 * The Identity Studio's design library.
 *
 * Every entry is one real file a member can apply — never a contact sheet,
 * never a placeholder. The list is written by `tools/identity-assets/build.mjs`
 * (at the repository root) from the masters it is given: it measures each
 * file, derives the sizes a page needs, reads its dominant colours and writes
 * this manifest, so the dimensions below are measured, not claimed. Adding
 * artwork is a new entry in that tool's catalogue, then a rebuild — nothing
 * in the Studio changes. `tests/unit/identity-assets.test.ts` checks that
 * every file named here exists and that every design has its name in both
 * languages.
 *
 * Server code only: the list is 250 KB. Browser code imports the vocabulary
 * from identity-asset-types.ts instead.
 *
 * Names and descriptions are i18n keys: `identity.asset.<id>` and
 * `identity.asset.<id>.desc`.
 */

export * from './identity-asset-types';
import type { IdentityAsset, IdentityAssetKind } from './identity-asset-types';

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
