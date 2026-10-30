import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { IDENTITY_ASSETS, IDENTITY_COLLECTIONS, IDENTITY_COLOR_FAMILIES, identityAsset } from '@/config/identity-assets';
import { IDENTITY_THEMES } from '@/config/identity-themes';
import { defaultIdentity } from '@/config/identity-studio';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import { parseIdentity } from '@/server/domains/identity/studio';

/**
 * The design library is a promise about files: every design named here is a
 * real file of the size the manifest says, has its words in both languages,
 * and every theme built from it is a profile the server would accept.
 */

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const dictionaries = { es: es as Record<string, string>, en: en as Record<string, string> };

describe('the design library', () => {
  it('names every design once, in a known collection, with known colours', () => {
    const ids = IDENTITY_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const asset of IDENTITY_ASSETS) {
      expect(IDENTITY_COLLECTIONS, asset.id).toContain(asset.collection);
      for (const color of asset.colors) expect(IDENTITY_COLOR_FAMILIES, `${asset.id} ${color}`).toContain(color);
      if (asset.kind === 'frame') expect(['circle', 'rounded'], asset.id).toContain(asset.frameShape);
      if (asset.kind === 'decoration') expect(['corners', 'header', 'border'], asset.id).toContain(asset.placement);
    }
  });

  it('serves only files that exist', () => {
    for (const asset of IDENTITY_ASSETS) {
      for (const file of [...asset.files, { url: asset.thumb }]) {
        expect(existsSync(path.join(PUBLIC, file.url)), `${asset.id}: ${file.url}`).toBe(true);
      }
    }
  });

  it('claims no size a file does not have, and never enlarges a master', async () => {
    for (const asset of IDENTITY_ASSETS.filter((a) => a.format === 'webp')) {
      const largest = asset.files[asset.files.length - 1]!;
      const meta = await sharp(path.join(PUBLIC, largest.url)).metadata();
      expect(meta.width, `${asset.id}: ${largest.url}`).toBe(largest.width);
      expect(largest.width, asset.id).toBeLessThanOrEqual(asset.width);
      // A design called 4K is 3840 wide in the file a 4K screen receives.
      if (asset.width >= 3840) expect(largest.width, asset.id).toBe(3840);
    }
  });

  it('has every design’s name and description, and every style’s name, in both languages', () => {
    for (const asset of IDENTITY_ASSETS) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[`identity.asset.${asset.id}`], `${lang} name ${asset.id}`).toBeTruthy();
        expect(dictionary[`identity.asset.${asset.id}.desc`], `${lang} desc ${asset.id}`).toBeTruthy();
        expect(dictionary[`studio.style.${asset.style}`], `${lang} style ${asset.style}`).toBeTruthy();
      }
    }
    for (const color of IDENTITY_COLOR_FAMILIES) {
      expect(dictionaries.es[`studio.color.${color}`]).toBeTruthy();
      expect(dictionaries.en[`studio.color.${color}`]).toBeTruthy();
    }
  });
});

describe('themes', () => {
  it('offers at least thirty, each named in both languages', () => {
    expect(IDENTITY_THEMES.length).toBeGreaterThanOrEqual(30);
    const ids = IDENTITY_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of IDENTITY_THEMES) {
      expect(dictionaries.es[`studio.theme.${theme.id}`], theme.id).toBeTruthy();
      expect(dictionaries.en[`studio.theme.${theme.id}`], theme.id).toBeTruthy();
    }
  });

  it('are each a profile the server accepts, built only from published designs', () => {
    for (const theme of IDENTITY_THEMES) {
      const base = defaultIdentity();
      const config = { ...base, appearance: { ...theme.appearance, theme: theme.id, avatar: { ...base.appearance.avatar, ...theme.appearance.avatar } } };
      expect(() => parseIdentity(config), theme.id).not.toThrow();
      const a = theme.appearance;
      if (a.background.kind === 'asset') expect(identityAsset(a.background.asset), `${theme.id} background`).not.toBeNull();
      if (a.cover.kind === 'asset') expect(identityAsset(a.cover.asset), `${theme.id} cover`).not.toBeNull();
      if (a.avatar.frame) expect(identityAsset(a.avatar.frame, 'frame'), `${theme.id} frame`).not.toBeNull();
      if (a.decoration.asset) expect(identityAsset(a.decoration.asset, 'decoration'), `${theme.id} ornament`).not.toBeNull();
      // A theme never carries a photo.
      expect(JSON.stringify(a)).not.toMatch(/"upload"|"media"/);
    }
  });
});
