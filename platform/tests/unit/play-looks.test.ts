import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PARTS, earnedItems, parseLook, withoutClash } from '@/config/play-looks';
import { GENESIS_PARTS, genesisDraws, genesisOptions } from '@/config/genesis-looks';
import { PLAY_RULES } from '@/config/business-rules';

describe('looks', () => {
  it('never wears the sunglasses accessory and a pair of glasses at once: the one just chosen wins', () => {
    const both = { ...DEFAULT_LOOK, glasses: 'redondos', accessory: 'lentes' };
    expect(withoutClash(both, 'glasses')).toMatchObject({ glasses: 'redondos', accessory: 'ninguno' });
    expect(withoutClash(both, 'accessory')).toMatchObject({ glasses: 'ninguno', accessory: 'lentes' });
    const hat = { ...DEFAULT_LOOK, glasses: 'redondos', accessory: 'gorra' };
    expect(withoutClash(hat, 'accessory')).toEqual(hat);
  });

  it('has a price for every option sold for gems', () => {
    for (const part of LOOK_PARTS) {
      for (const option of LOOK_OPTIONS[part]) {
        if (option.unlock === 'gems') expect(PLAY_RULES.gems[`${part}:${option.id}`], `${part}:${option.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('offers only what Genesis draws, and something for every part it draws', () => {
    for (const part of LOOK_PARTS) expect(genesisOptions(part).length > 0, part).toBe(GENESIS_PARTS.includes(part));
    // Not drawn yet: beards, glasses, patterned tops, and faces named after a painted feature.
    expect(genesisDraws('beard', 'completa')).toBe(false);
    expect(genesisDraws('glasses', 'aviador')).toBe(false);
    expect(genesisDraws('top', 'galaxia')).toBe(false);
    expect(genesisDraws('face', 'pecas')).toBe(false);
    expect(genesisDraws('face', 'ojos_claros')).toBe(true);
    expect(genesisDraws('top', 'guayabera_oro')).toBe(true);
    expect(genesisDraws('top', 'tirantes')).toBe(false);
    expect(genesisDraws('shoes', 'sandalias')).toBe(false);
    // Every default is offered, so a new player starts on something the Studio shows.
    for (const part of GENESIS_PARTS) expect(genesisDraws(part, DEFAULT_LOOK[part]), part).toBe(true);
  });

  it('keeps every earned option on the catalogue, offered or not, so nothing owned is lost', () => {
    const items = earnedItems().map((e) => e.item);
    expect(items).toContain('beard:charro');
    expect(items).toContain('accessory:sombrero_fundador');
    expect(parseLook({ ...DEFAULT_LOOK, beard: 'charro', accessory: 'sombrero_fundador' })).toMatchObject({ beard: 'charro', accessory: 'sombrero_fundador' });
  });

  it('keeps a saved look that wore a print since taken out, without the print', () => {
    expect(parseLook({ ...DEFAULT_LOOK, print: 'zarpazo', beard: 'completa' })).toMatchObject({ print: 'ninguno', beard: 'completa' });
  });
});
