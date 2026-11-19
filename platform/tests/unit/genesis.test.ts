import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENESIS_ASSETS_VERSION, GENESIS_CONTROLS, GENESIS_GARMENTS, GENESIS_HAIR, GENESIS_MASK_BITS, GENESIS_SHOES, genesisInfluences, genesisMorphNames } from '@/config/genesis';
import { genesisFromLook } from '@/config/genesis-looks';
import { DEFAULT_LOOK, LOOK_OPTIONS } from '@/config/play-looks';

/**
 * Yavaya Genesis's contract (docs/GENESIS.md): the baked files carry every
 * control the game may ask for, every asset the game may wear exists, and
 * every look a player already has becomes a Genesis character.
 */
const DIR = join(process.cwd(), 'public', 'play', 'genesis', `v${GENESIS_ASSETS_VERSION}`);
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { version: number; assets: Array<{ id: string; file: string; morphs?: number; license?: string; commit?: string }> };

describe('Genesis controls', () => {
  it('are pairs around the neutral face, clamped to the safe range', () => {
    expect(genesisInfluences({ 'nose.width': 0.6 })).toMatchObject({ 'nose.width-': 0, 'nose.width+': 0.6 });
    expect(genesisInfluences({ 'nose.width': -3 })).toMatchObject({ 'nose.width-': 1, 'nose.width+': 0 });
    expect(genesisInfluences({ 'head.round': -1 })).toMatchObject({ 'head.round': 0 });
    expect(genesisInfluences({ 'head.round': Number.NaN })).toMatchObject({ 'head.round': 0 });
    // Every control is answered, set or not, so a shape never keeps a stale value.
    expect(Object.keys(genesisInfluences({}))).toHaveLength(genesisMorphNames().length);
  });

  it('are all baked into the core file', () => {
    const core = manifest.assets.find((a) => a.id === 'core')!;
    expect(manifest.version).toBe(GENESIS_ASSETS_VERSION);
    expect(core.morphs).toBe(genesisMorphNames().length);
    expect(new Set(GENESIS_CONTROLS.map((c) => c.id)).size).toBe(GENESIS_CONTROLS.length);
  });
});

describe('Genesis assets', () => {
  it('exist for every hairstyle, garment and pair of shoes the game may wear, with their source and licence', () => {
    const files = [
      'core.glb',
      ...GENESIS_HAIR.map((h) => `hair-${h}.glb`),
      ...GENESIS_GARMENTS.map((g) => `garment-${g}.glb`),
      ...Object.keys(GENESIS_SHOES).map((s) => `shoes-${s}.glb`),
    ];
    for (const file of files) {
      expect(existsSync(join(DIR, file)), file).toBe(true);
      const entry = manifest.assets.find((a) => a.file === file);
      expect(entry, file).toBeDefined();
      expect(entry).toMatchObject({ license: 'CC0-1.0' });
      expect(entry!.commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('cover the skin with flags of their own', () => {
    const bits = Object.values(GENESIS_MASK_BITS);
    expect(new Set(bits).size).toBe(bits.length);
    for (const g of GENESIS_GARMENTS) expect(GENESIS_MASK_BITS[`garment.${g}`]).toBeTypeOf('number');
    for (const s of Object.keys(GENESIS_SHOES)) expect(GENESIS_MASK_BITS[`shoes.${s}`]).toBeTypeOf('number');
  });
});

describe('A look a player already has', () => {
  it('becomes a Genesis character for every face, hairstyle, top, bottom and pair of shoes', () => {
    for (const part of ['face', 'hair', 'top', 'bottom', 'shoes', 'body', 'skin', 'hairColor'] as const) {
      for (const option of LOOK_OPTIONS[part]) {
        const genesis = genesisFromLook({ ...DEFAULT_LOOK, [part]: option.id });
        expect(GENESIS_HAIR).toContain(genesis.hair);
        expect(GENESIS_GARMENTS).toContain(genesis.top.garment);
        expect(GENESIS_GARMENTS).toContain(genesis.bottom.garment);
        expect(Object.keys(GENESIS_SHOES)).toContain(genesis.shoes.id);
        for (const id of Object.keys(genesis.controls)) expect(GENESIS_CONTROLS.map((c) => c.id), id).toContain(id);
        expect(Number.isInteger(genesis.skin)).toBe(true);
      }
    }
  });

  it('keeps what the player chose: colours, sleeves and shorts', () => {
    const look = genesisFromLook({ ...DEFAULT_LOOK, top: 'sudadera', bottom: 'short', skin: 'ebano', hair: 'largo', hairColor: 'turquesa' });
    expect(look).toMatchObject({ top: { garment: 'longsleeve' }, bottom: { garment: 'shorts' }, hair: 'long01' });
    expect(look.skin).toBe(LOOK_OPTIONS.skin.find((o) => o.id === 'ebano')!.color);
    expect(look.hairColor).toBe(LOOK_OPTIONS.hairColor.find((o) => o.id === 'turquesa')!.color);
  });
});
