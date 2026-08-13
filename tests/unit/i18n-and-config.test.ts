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
      email_verified: 2,
      phone_verified: 5,
      identity_verified: 10,
      successful_transaction: 2,
      successful_delivery: 2,
      verified_positive_review: 1,
      approved_cause: 3,
      approved_animal_adoption: 5,
      warning_issued: -10,
      confirmed_fraudulent_listing: -25,
    });
  });

  it('starts every account at 50 of 100', () => {
    expect(REPUTATION_RULES.initialScore).toBe(50);
    expect(REPUTATION_RULES.maximumScore).toBe(100);
  });
});

describe('district registry', () => {
  it('registers all eight districts with unique slugs and layouts', () => {
    expect(DISTRICT_KEYS).toHaveLength(8);
    const slugs = districtList.map((district) => district.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // Distinct layout archetypes are what stop Yavaya being one grid recoloured
    // eight times.
    const layouts = districtList.map((district) => district.theme.layout);
    expect(new Set(layouts).size).toBe(layouts.length);
  });

  it('does not claim any district is available before it is built', () => {
    for (const district of districtList) {
      if (district.status === 'available') {
        throw new Error(`${district.key} is marked available but no district is built yet`);
      }
    }
  });
});
