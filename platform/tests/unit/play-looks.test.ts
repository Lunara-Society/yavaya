import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PARTS, lookImage, parseLook, withoutClash } from '@/config/play-looks';
import { PLAY_RULES } from '@/config/business-rules';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('looks', () => {
  it('never wears the sunglasses accessory and a pair of glasses at once: the one just chosen wins', () => {
    const both = { ...DEFAULT_LOOK, glasses: 'redondos', accessory: 'lentes' };
    expect(withoutClash(both, 'glasses')).toMatchObject({ glasses: 'redondos', accessory: 'ninguno' });
    expect(withoutClash(both, 'accessory')).toMatchObject({ glasses: 'ninguno', accessory: 'lentes' });
    const hat = { ...DEFAULT_LOOK, glasses: 'redondos', accessory: 'gorra' };
    expect(withoutClash(hat, 'accessory')).toEqual(hat);
  });

  it('has a picture for every option that says it has one, and a price for every one sold for gems', () => {
    for (const part of LOOK_PARTS) {
      for (const option of LOOK_OPTIONS[part]) {
        const url = lookImage(part, option.id);
        if (url) expect(existsSync(join(process.cwd(), 'public', url)), url).toBe(true);
        if (option.unlock === 'gems') expect(PLAY_RULES.gems[`${part}:${option.id}`], `${part}:${option.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps a saved look that wore a print since taken out, without the print', () => {
    expect(parseLook({ ...DEFAULT_LOOK, print: 'zarpazo', beard: 'completa' })).toMatchObject({ print: 'ninguno', beard: 'completa' });
  });
});
