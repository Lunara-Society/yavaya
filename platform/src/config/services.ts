/**
 * Servicios: the categories of work people ask each other for.
 *
 * `regulated` — a profession that needs a licence (psychology, nursing, law).
 *   A provider must state theirs to offer it, and it shows as verified only
 *   after a reviewer has checked it.
 * `sensitive` — what a person writes here is private (a crisis at home, a
 *   health problem). Such requests are shown only to providers of that
 *   category, and the requester may hide their name.
 *
 * Names and examples are i18n keys: `services.category.<key>` and
 * `services.category.<key>.examples`.
 */
export const SERVICE_CATEGORIES = [
  { key: 'home_repairs', icon: 'home', regulated: false, sensitive: false },
  { key: 'cleaning_garden', icon: 'sprout', regulated: false, sensitive: false },
  { key: 'vehicles', icon: 'car', regulated: false, sensitive: false },
  { key: 'technology', icon: 'phone', regulated: false, sensitive: false },
  { key: 'mental_health', icon: 'heart', regulated: true, sensitive: true },
  { key: 'health_care', icon: 'hands', regulated: true, sensitive: true },
  { key: 'children_lessons', icon: 'book', regulated: false, sensitive: false },
  { key: 'legal_paperwork', icon: 'scale', regulated: true, sensitive: false },
  { key: 'beauty', icon: 'star', regulated: false, sensitive: false },
  { key: 'events', icon: 'palette', regulated: false, sensitive: false },
] as const;

export type ServiceCategoryKey = (typeof SERVICE_CATEGORIES)[number]['key'];
export const SERVICE_CATEGORY_KEYS = SERVICE_CATEGORIES.map((category) => category.key) as unknown as readonly [ServiceCategoryKey, ...ServiceCategoryKey[]];

export function serviceCategory(key: string) {
  return SERVICE_CATEGORIES.find((category) => category.key === key) ?? null;
}

export const SENSITIVE_CATEGORIES: readonly ServiceCategoryKey[] = SERVICE_CATEGORIES.filter((c) => c.sensitive).map((c) => c.key);
export const REGULATED_CATEGORIES: readonly ServiceCategoryKey[] = SERVICE_CATEGORIES.filter((c) => c.regulated).map((c) => c.key);
