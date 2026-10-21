import { describe, expect, it } from 'vitest';
import { band, cleanDevice, cleanPath, cleanSource, cleanVital, AUTOMATED } from '@/server/domains/stats/rules';

const OWN = ['yavaya.lat', 'www.yavaya.lat'];

describe('what a visit statistic may contain', () => {
  it('keeps a route, never an address with ids, words or a query in it', () => {
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('/mercadito/[id]')).toBe('/mercadito/[id]');
    expect(cleanPath('/mercadito/')).toBe('/mercadito');
    expect(cleanPath('/mercadito?q=bicicleta')).toBeNull();
    expect(cleanPath('/buscar/ana@example.com')).toBeNull();
    expect(cleanPath('/a b')).toBeNull();
    expect(cleanPath('mercadito')).toBeNull();
    expect(cleanPath('/' + 'x'.repeat(130))).toBeNull();
    expect(cleanPath('/a/b/c/d/e/f/g/h/i')).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });

  it('never counts Espacio Violeta, the panels or the API', () => {
    expect(cleanPath('/violeta')).toBeNull();
    expect(cleanPath('/violeta/privado/[id]')).toBeNull();
    expect(cleanPath('/admin/visitas')).toBeNull();
    expect(cleanPath('/api/metrics')).toBeNull();
    // A page that merely starts with the same letters is still counted.
    expect(cleanPath('/violetas')).toBe('/violetas');
  });

  it('names where a visit came from by site, and Yavaya itself as no source', () => {
    expect(cleanSource('', OWN)).toBe('direct');
    expect(cleanSource(undefined, OWN)).toBe('direct');
    expect(cleanSource('yavaya.lat', OWN)).toBe('');
    expect(cleanSource('www.google.com.ni', OWN)).toBe('google');
    expect(cleanSource('com.google.android.googlequicksearchbox', OWN)).toBe('google');
    expect(cleanSource('l.facebook.com', OWN)).toBe('facebook');
    expect(cleanSource('lm.facebook.com', OWN)).toBe('facebook');
    expect(cleanSource('t.co', OWN)).toBe('x');
    expect(cleanSource('www.laprensani.com', OWN)).toBe('laprensani.com');
    expect(cleanSource('https://evil.example/path', OWN)).toBeNull();
    expect(cleanSource('<script>', OWN)).toBeNull();
  });

  it('accepts only the three kinds of screen', () => {
    expect(cleanDevice('phone')).toBe('phone');
    expect(cleanDevice('watch')).toBeNull();
  });

  it('accepts only the five measures, within believable values, and bands them as the web guidance does', () => {
    expect(cleanVital('LCP', 1800)).toEqual({ metric: 'LCP', value: 1800 });
    expect(cleanVital('LCP', -1)).toBeNull();
    expect(cleanVital('LCP', Number.NaN)).toBeNull();
    expect(cleanVital('LCP', 10 * 60_000)).toBeNull();
    expect(cleanVital('FID', 10)).toBeNull();
    expect(band('LCP', 2500)).toBe('good');
    expect(band('LCP', 2501)).toBe('needsImprovement');
    expect(band('LCP', 4001)).toBe('poor');
    expect(band('CLS', 0.05)).toBe('good');
    expect(band('INP', 600)).toBe('poor');
  });

  it('recognises scripted visitors but not in-app browsers', () => {
    expect(AUTOMATED.test('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0')).toBe(true);
    expect(AUTOMATED.test('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(AUTOMATED.test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) [FBAN/FBIOS;FBAV/440.0]')).toBe(false);
    expect(AUTOMATED.test('Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe(false);
  });
});
