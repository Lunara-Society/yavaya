import { describe, expect, it } from 'vitest';
import { mobileConfig, parseFlags } from '@/server/domains/platform/mobile-config';

describe('mobile remote config', () => {
  it('passes booleans for flag-like names only', () => {
    expect(parseFlags('{"awakening":false,"sound":true,"bad key":true,"lab":"yes","n":1}')).toEqual({ awakening: false, sound: true });
  });
  it('treats missing or malformed input as no overrides', () => {
    expect(parseFlags(undefined)).toEqual({});
    expect(parseFlags('not json')).toEqual({});
    expect(parseFlags('[true]')).toEqual({});
    expect(parseFlags('null')).toEqual({});
  });
  it('caps the number of flags', () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`f${i}`, true]));
    expect(Object.keys(parseFlags(JSON.stringify(many)))).toHaveLength(64);
  });
  it('carries the minimum build and the notice', () => {
    expect(mobileConfig('{}', 3, 'Mantenimiento')).toEqual({ flags: {}, minBuild: 3, message: 'Mantenimiento' });
    expect(mobileConfig(undefined, 0, undefined)).toEqual({ flags: {}, minBuild: 0, message: null });
  });
});
