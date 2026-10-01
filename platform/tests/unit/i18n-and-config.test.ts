import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import { createTranslator } from '@/i18n';
import { negotiateLocale } from '@/i18n/config';
import { TOKEN_PACKAGES, TOKEN_RULES, REPUTATION_RULE_DEFAULTS, REPUTATION_RULES } from '@/config/business-rules';
import { DISTRICT_KEYS, districtList } from '@/config/districts';

describe('dictionaries', () => {
  it('cover the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('use the same interpolation placeholders in both locales', () => {
    const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(es) as Array<keyof typeof es>) {
      expect(placeholders(en[key]), `placeholders differ for ${key}`).toEqual(
        placeholders(es[key]),
      );
    }
  });

  it('has a translated name and tagline for every district', () => {
    for (const district of districtList) {
      expect(es[district.nameKey as keyof typeof es]).toBeDefined();
      expect(es[district.taglineKey as keyof typeof es]).toBeDefined();
    }
  });

  it('interpolates parameters and leaves unknown ones intact', () => {
    const t = createTranslator('en');
    expect(t('trust.account_age_days', { days: 214 })).toBe('214 days');
    expect(t('district.phase', {})).toBe('Phase {phase}');
  });

  it('negotiates a locale from Accept-Language, defaulting to Spanish', () => {
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
    expect(negotiateLocale('es-GT,es;q=0.9,en;q=0.5')).toBe('es');
    expect(negotiateLocale('fr-FR')).toBe('es');
    expect(negotiateLocale(null)).toBe('es');
  });
});

describe('token business rules', () => {
  it('offers no package that exceeds the per-purchase ceiling', () => {
    for (const pkg of TOKEN_PACKAGES.filter((candidate) => candidate.enabled)) {
      expect(pkg.tokens).toBeLessThanOrEqual(TOKEN_RULES.maxTokensPerPurchase);
    }
  });

  it('keeps the 100-token package in the catalogue but disabled', () => {
    const hundred = TOKEN_PACKAGES.find((pkg) => pkg.tokens === 100);
    expect(hundred).toBeDefined();
    expect(hundred?.enabled).toBe(false);
  });

  it('exposes exactly the launch packages', () => {
    expect(TOKEN_PACKAGES.filter((pkg) => pkg.enabled).map((pkg) => pkg.tokens)).toEqual([
      5, 10, 25, 50,
    ]);
  });

  it('caps the starter allocation at the stated total', () => {
    expect(TOKEN_RULES.starterGrantPerDay * TOKEN_RULES.starterGrantDays).toBe(
      TOKEN_RULES.starterGrantMaximum,
    );
  });
});

describe('reputation rules', () => {
  it('matches the specified starting weights', () => {
    const byKey = Object.fromEntries(REPUTATION_RULE_DEFAULTS.map((rule) => [rule.key, rule.delta]));
    expect(byKey).toMatchObject({
      email_verified: 20,
      phone_verified: 50,
      identity_verified: 100,
      successful_transaction: 20,
      successful_delivery: 20,
      verified_positive_review: 10,
      approved_cause: 30,
      approved_animal_adoption: 50,
      warning_issued: -100,
      confirmed_fraudulent_listing: -250,
    });
  });

  it("starts every account at 500 of 1000, the Bible's scale", () => {
    expect(REPUTATION_RULES.initialScore).toBe(500);
    expect(REPUTATION_RULES.maximumScore).toBe(1000);
  });
});

describe('district registry', () => {
  it('registers the seven districts with unique slugs and layouts', () => {
    expect([...DISTRICT_KEYS]).toEqual(['mercadito', 'services', 'works', 'yavayago', 'community', 'sanctuary', 'animals']);
    const slugs = districtList.map((district) => district.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // Distinct layout archetypes are what stop Yavaya being one grid recoloured
    // seven times.
    const layouts = districtList.map((district) => district.theme.layout);
    expect(new Set(layouts).size).toBe(layouts.length);

    // Every slug is a real page, so no link in the navigation leads nowhere.
    for (const district of districtList) {
      expect(existsSync(new URL(`../../src/app/${district.slug}/page.tsx`, import.meta.url)), district.slug).toBe(true);
    }
  });

  it('does not claim any district is available before it is built', () => {
    // A district joins this list in the same change that builds it — with
    // its pages, its service and its tests. Marking one available without
    // that is exactly what the capability register exists to prevent.
    const built = new Set(['mercadito', 'community', 'sanctuary']);
    for (const district of districtList) {
      if (district.status === 'available' && !built.has(district.key)) {
        throw new Error(`${district.key} is marked available but is not built`);
      }
    }
    for (const key of built) {
      expect(existsSync(new URL(`../../src/app/${key}/page.tsx`, import.meta.url))).toBe(true);
    }
  });
});
