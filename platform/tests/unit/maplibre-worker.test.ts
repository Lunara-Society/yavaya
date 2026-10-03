import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAPLIBRE_VERSION } from '@/ui/go/map';

/**
 * The map's worker is served from public/maplibre/<version>/, copied from
 * the package. A package upgrade without a fresh copy would load a worker
 * from another version, and maps would silently break.
 */
describe('map worker copy', () => {
  it('matches the installed maplibre-gl, byte for byte', () => {
    const installed = JSON.parse(readFileSync('node_modules/maplibre-gl/package.json', 'utf8')) as { version: string };
    expect(installed.version).toBe(MAPLIBRE_VERSION);
    for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      expect(readFileSync(`public/maplibre/${MAPLIBRE_VERSION}/${file}`).equals(readFileSync(`node_modules/maplibre-gl/dist/${file}`))).toBe(true);
    }
  });
});
