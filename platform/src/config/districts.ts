/**
 * The district registry.
 *
 * A district is a distinct product experience inside one ecosystem — its own
 * layout, information hierarchy, atmosphere and interaction patterns, sharing
 * Yavaya's navigation, identity, Trust Shield and notification infrastructure.
 *
 * `phase` records the roadmap phase that delivers the district. `status`
 * records what is actually built right now. They are separate on purpose: the
 * UI must never present a planned district as an available one.
 */

/**
 * Seven districts, each answering one question a person already asks in their
 * own words. Order is the order shown everywhere.
 *
 * Impact was folded into Community (as "Causes") and the Tavern taken off the
 * roadmap in the owner's restructure; Sanctuary was promoted from a space
 * inside Community to a district of its own. The key `works` is kept for data
 * already written under it; its display name is "Trabajo".
 */
export const DISTRICT_KEYS = [
  'mercadito',
  'services',
  'works',
  'yavayago',
  'community',
  'sanctuary',
  'animals',
] as const;

export type DistrictKey = (typeof DISTRICT_KEYS)[number];

export type DistrictStatus = 'available' | 'in_development' | 'planned';

export type DistrictDefinition = {
  key: DistrictKey;
  /** URL segment. Locale-independent; the display name is translated. */
  slug: string;
  /** i18n key for the display name. Never a literal string. */
  nameKey: string;
  taglineKey: string;
  phase: 1 | 2 | 3;
  status: DistrictStatus;
  /** CSS custom-property namespace applied by the district shell. */
  theme: DistrictTheme;
};

export type DistrictTheme = {
  /** Named accent, matching the design system's district palettes. */
  accent: string;
  /** Design-system token set: see src/ui/theme/districts.css. */
  tokenSet: string;
  /**
   * The layout archetype the district uses. Distinct archetypes are what stop
   * Yavaya from being one card grid recoloured eight times.
   */
  layout:
    | 'request-board'
    | 'discovery-density'
    | 'motion-map'
    | 'professional-directory'
    | 'calm-column'
    | 'organic-profile'
    | 'sacred-nave';
};

export const DISTRICTS: Record<DistrictKey, DistrictDefinition> = {
  mercadito: {
    key: 'mercadito',
    slug: 'mercadito',
    nameKey: 'district.mercadito.name',
    taglineKey: 'district.mercadito.tagline',
    phase: 1,
    status: 'available',
    theme: { accent: 'emerald', tokenSet: 'district-mercadito', layout: 'discovery-density' },
  },
  services: {
    key: 'services',
    slug: 'services',
    nameKey: 'district.services.name',
    taglineKey: 'district.services.tagline',
    phase: 1,
    status: 'available',
    theme: { accent: 'teal', tokenSet: 'district-services', layout: 'request-board' },
  },
  works: {
    key: 'works',
    slug: 'work',
    nameKey: 'district.works.name',
    taglineKey: 'district.works.tagline',
    phase: 2,
    status: 'available',
    theme: { accent: 'deep-blue', tokenSet: 'district-works', layout: 'professional-directory' },
  },
  yavayago: {
    key: 'yavayago',
    slug: 'yavayago',
    nameKey: 'district.yavayago.name',
    taglineKey: 'district.yavayago.tagline',
    phase: 2,
    status: 'planned',
    theme: { accent: 'orange', tokenSet: 'district-yavayago', layout: 'motion-map' },
  },
  community: {
    key: 'community',
    slug: 'community',
    nameKey: 'district.community.name',
    taglineKey: 'district.community.tagline',
    phase: 1,
    status: 'available',
    theme: { accent: 'purple', tokenSet: 'district-community', layout: 'calm-column' },
  },
  sanctuary: {
    key: 'sanctuary',
    slug: 'sanctuary',
    nameKey: 'district.sanctuary.name',
    taglineKey: 'district.sanctuary.tagline',
    phase: 1,
    status: 'available',
    theme: { accent: 'ivory', tokenSet: 'district-sanctuary', layout: 'sacred-nave' },
  },
  animals: {
    key: 'animals',
    slug: 'animals',
    nameKey: 'district.animals.name',
    taglineKey: 'district.animals.tagline',
    phase: 1,
    status: 'available',
    theme: { accent: 'forest', tokenSet: 'district-animals', layout: 'organic-profile' },
  },
};

export const districtList: readonly DistrictDefinition[] = DISTRICT_KEYS.map((key) => DISTRICTS[key]);

export function districtBySlug(slug: string): DistrictDefinition | null {
  return districtList.find((district) => district.slug === slug) ?? null;
}

export function isDistrictKey(value: string): value is DistrictKey {
  return (DISTRICT_KEYS as readonly string[]).includes(value);
}
