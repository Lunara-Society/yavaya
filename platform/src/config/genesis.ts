/**
 * Yavaya Genesis: the character every game draws (docs/GENESIS.md).
 *
 * This file is the contract between the asset baker (scripts/genesis) and the
 * games: the names of the shape controls the baked files carry as morph
 * targets, and the assets there are. The baker reads it to know what to
 * bake; the runtime reads it to know what it may ask for. Plain data, so the
 * server can check a saved character against it too.
 *
 * Every control is a pair of morph targets around the neutral adult, "-" and
 * "+", so a slider runs from -1 to 1 through 0 (the neutral). Single-sided
 * controls (a head shape preset) run 0 to 1.
 */

/** The asset set's version: files live in /play/genesis/v<version>/. A rebake that changes shapes bumps it. */
export const GENESIS_ASSETS_VERSION = 1;

export type GenesisControlGroup = 'body' | 'head' | 'eyes' | 'nose' | 'cheeks' | 'mouth' | 'jaw';

export type GenesisControl = {
  id: string;
  group: GenesisControlGroup;
  /** Morph target names: `${id}-` and `${id}+`, or just `${id}` for a one-sided control. */
  sided: 'both' | 'plus';
};

/**
 * The first, most reliable controls (owner's brief: start with those before
 * adding dozens more). Each is backed by sculpted MakeHuman targets, never a
 * plain scale, so the face stays one coherent surface.
 */
export const GENESIS_CONTROLS: GenesisControl[] = [
  { id: 'body.gender', group: 'body', sided: 'both' },
  { id: 'body.muscle', group: 'body', sided: 'both' },
  { id: 'body.weight', group: 'body', sided: 'both' },
  { id: 'body.height', group: 'body', sided: 'both' },
  { id: 'head.width', group: 'head', sided: 'both' },
  { id: 'head.length', group: 'head', sided: 'both' },
  { id: 'forehead.height', group: 'head', sided: 'both' },
  { id: 'temple.width', group: 'head', sided: 'both' },
  { id: 'head.oval', group: 'head', sided: 'plus' },
  { id: 'head.round', group: 'head', sided: 'plus' },
  { id: 'head.square', group: 'head', sided: 'plus' },
  { id: 'head.invertedtriangular', group: 'head', sided: 'plus' },
  { id: 'eye.size', group: 'eyes', sided: 'both' },
  { id: 'eye.spacing', group: 'eyes', sided: 'both' },
  { id: 'eye.angle', group: 'eyes', sided: 'both' },
  { id: 'nose.length', group: 'nose', sided: 'both' },
  { id: 'nose.width', group: 'nose', sided: 'both' },
  { id: 'nose.bridge', group: 'nose', sided: 'both' },
  { id: 'nose.tip', group: 'nose', sided: 'both' },
  { id: 'nose.nostrils', group: 'nose', sided: 'both' },
  { id: 'cheek.bones', group: 'cheeks', sided: 'both' },
  { id: 'cheek.height', group: 'cheeks', sided: 'both' },
  { id: 'cheek.fullness', group: 'cheeks', sided: 'both' },
  { id: 'mouth.width', group: 'mouth', sided: 'both' },
  { id: 'lip.upper', group: 'mouth', sided: 'both' },
  { id: 'lip.lower', group: 'mouth', sided: 'both' },
  { id: 'chin.width', group: 'jaw', sided: 'both' },
  { id: 'chin.length', group: 'jaw', sided: 'both' },
  { id: 'chin.projection', group: 'jaw', sided: 'both' },
  { id: 'jaw.definition', group: 'jaw', sided: 'both' },
];

/** Every morph target name the baked files carry, in a stable order. */
export function genesisMorphNames(): string[] {
  return GENESIS_CONTROLS.flatMap((c) => (c.sided === 'both' ? [`${c.id}-`, `${c.id}+`] : [c.id]));
}

/** The morph influences for a set of control values (-1…1, or 0…1 one-sided), clamped to the safe range. */
export function genesisInfluences(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const control of GENESIS_CONTROLS) {
    const raw = values[control.id] ?? 0;
    const value = Number.isFinite(raw) ? Math.max(control.sided === 'both' ? -1 : 0, Math.min(1, raw)) : 0;
    if (control.sided === 'plus') out[control.id] = value;
    else {
      out[`${control.id}-`] = Math.max(0, -value);
      out[`${control.id}+`] = Math.max(0, value);
    }
  }
  return out;
}

/** Hairstyles baked from MakeHuman's CC0 hair (asset id → source style). */
export const GENESIS_HAIR = ['short02', 'short04', 'long01', 'ponytail01', 'braid01', 'afro01', 'bob02'] as const;
export type GenesisHair = (typeof GENESIS_HAIR)[number];

/** Garments cut from the body's own fitted shell (scripts/genesis/garments.ts). */
export const GENESIS_GARMENTS = ['tee', 'longsleeve', 'trousers', 'shorts'] as const;
export type GenesisGarment = (typeof GENESIS_GARMENTS)[number];

/** Shoes, from MakeHuman's CC0 shoes (asset id → source). */
export const GENESIS_SHOES = { sneaker: 'shoes05', boot: 'shoes03', dress: 'shoes01' } as const;
export type GenesisShoes = keyof typeof GENESIS_SHOES;

/**
 * Which skin each garment and pair of shoes covers is carried on the body's
 * own vertices (an attribute of flags, one bit each, `_GARMENTS`), so it
 * survives any reordering the file compression does. A body triangle is
 * hidden when all its corners are covered by something worn.
 */
export const GENESIS_MASK_BITS: Record<string, number> = {
  'garment.tee': 0,
  'garment.longsleeve': 1,
  'garment.trousers': 2,
  'garment.shorts': 3,
  'shoes.sneaker': 4,
  'shoes.boot': 5,
  'shoes.dress': 6,
};
