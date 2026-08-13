import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  DEFAULT_THEME_PREFERENCE,
  LANGUAGE_PREFERENCES,
  THEME_PREFERENCES,
  isLanguagePreference,
  isThemePreference,
  themeAttributeFor,
} from '@/config/preferences';
import { negotiateLocale } from '@/i18n/config';
import { CAPABILITIES, CAPABILITY_STATES, stateLabelKey } from '@/config/capabilities';
import { districtList } from '@/config/districts';
import { es } from '@/i18n/dictionaries/es';

describe('display preferences', () => {
  it('follows the device by default', () => {
    expect(DEFAULT_LANGUAGE_PREFERENCE).toBe('auto');
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
  });

  it('accepts only known values', () => {
    for (const value of LANGUAGE_PREFERENCES) expect(isLanguagePreference(value)).toBe(true);
    for (const value of THEME_PREFERENCES) expect(isThemePreference(value)).toBe(true);

    // A tampered cookie must not become a preference.
    expect(isLanguagePreference('fr')).toBe(false);
    expect(isLanguagePreference('')).toBe(false);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference('auto')).toBe(false);
  });

  it('emits no theme attribute when following the system', () => {
    // `data-theme="system"` would match no CSS rule and strand the page in the
    // light palette, so `system` must resolve to no attribute at all.
    expect(themeAttributeFor('system')).toBeNull();
    expect(themeAttributeFor('light')).toBe('light');
    expect(themeAttributeFor('dark')).toBe('dark');
  });
});

describe('automatic language detection', () => {
  it('picks the device language when it is one Yavaya speaks', () => {
    expect(negotiateLocale('es-GT,es;q=0.9')).toBe('es');
    expect(negotiateLocale('es-HN')).toBe('es');
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
    expect(negotiateLocale('en-BZ')).toBe('en');
  });

  it('honours quality ordering rather than header position', () => {
    // Listed first but weighted lower, so Spanish wins.
    expect(negotiateLocale('en;q=0.3,es;q=0.9')).toBe('es');
    expect(negotiateLocale('es;q=0.2,en;q=0.9')).toBe('en');
    // The highest-ranked language Yavaya actually speaks wins, skipping others.
    expect(negotiateLocale('fr;q=1.0,en;q=0.8')).toBe('en');
  });

  it('falls back to Spanish, not English', () => {
    // Yavaya's users are in Central America. An unrecognised device language
    // must not land them in English.
    expect(negotiateLocale('fr-FR,de;q=0.8')).toBe('es');
    expect(negotiateLocale('')).toBe('es');
    expect(negotiateLocale(null)).toBe('es');
  });
});

describe('capability register', () => {
  it('declares a valid state for every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_STATES).toContain(capability.state);
    }
  });

  it('has a translated name and detail for every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(es[capability.nameKey as keyof typeof es], capability.key).toBeDefined();
      expect(es[capability.detailKey as keyof typeof es], capability.key).toBeDefined();
    }
  });

  it('has a label and an explanation for every state', () => {
    for (const state of CAPABILITY_STATES) {
      expect(es[stateLabelKey(state) as keyof typeof es]).toBeDefined();
      expect(es[`capability.state.${state}.explain` as keyof typeof es]).toBeDefined();
    }
  });

  it('explains anything that is not REAL', () => {
    // A capability that is unavailable without saying why is the failure mode
    // this register exists to prevent.
    for (const capability of CAPABILITIES) {
      if (capability.state !== 'REAL') {
        expect(capability.blockedBy, `${capability.key} must explain itself`).toBeTruthy();
      }
    }
  });

  it('uses unique keys', () => {
    const keys = CAPABILITIES.map((capability) => capability.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not claim districts are real while none is built', () => {
    const anyDistrictAvailable = districtList.some((district) => district.status === 'available');
    const districtCapability = CAPABILITIES.find((capability) => capability.key === 'districts');

    expect(districtCapability).toBeDefined();
    if (!anyDistrictAvailable) {
      expect(districtCapability?.state).not.toBe('REAL');
    }
  });

  it('contains no MOCK capability', () => {
    // Nothing in Yavaya is currently a stand-in. If that ever changes the state
    // exists to say so — but it must be a deliberate, visible change, not
    // something that slips in.
    expect(CAPABILITIES.filter((capability) => capability.state === 'MOCK')).toEqual([]);
  });
});
