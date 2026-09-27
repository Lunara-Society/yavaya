import { describe, expect, it } from 'vitest';
import { siteEs } from '@/i18n/site/es';
import { siteEn } from '@/i18n/site/en';

/**
 * The type system already makes a missing English field a compile error. What
 * it cannot see is a list with a different number of entries — an FAQ answer
 * or a district rule present in one language and silently missing in the
 * other. This walks both trees and compares them.
 */
function differences(a: unknown, b: unknown, path: string, out: string[]): string[] {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) out.push(`${path}: array in es only`);
    else {
      if (a.length !== b.length) out.push(`${path}: ${a.length} entries in es, ${b.length} in en`);
      a.forEach((value, i) => i < b.length && differences(value, b[i], `${path}[${i}]`, out));
    }
  } else if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') out.push(`${path}: object in es only`);
    else {
      for (const key of Object.keys(a)) {
        if (!(key in b)) out.push(`${path}.${key}: missing in en`);
        else differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, out);
      }
      for (const key of Object.keys(b)) if (!(key in a)) out.push(`${path}.${key}: only in en`);
    }
  } else if (typeof a !== typeof b) {
    out.push(`${path}: ${typeof a} in es, ${typeof b} in en`);
  }
  return out;
}

describe('website content', () => {
  it('has the same structure in Spanish and English', () => {
    expect(differences(siteEs, siteEn, 'site', [])).toEqual([]);
  });

  it('marks every status with a known state', () => {
    const states = Object.keys(siteEs.ui.states);
    for (const phase of [...siteEs.pages.roadmap.phases, ...siteEn.pages.roadmap.phases]) {
      expect(states).toContain(phase.state);
    }
  });
});
