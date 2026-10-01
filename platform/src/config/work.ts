/**
 * Trabajo: fields of work, kinds of engagement and where the work happens.
 * Names are i18n keys: `work.field.<key>`, `work.employment.<key>`,
 * `work.place_mode.<key>`.
 */
export const WORK_FIELDS = [
  'technology',
  'design',
  'marketing',
  'writing',
  'finance',
  'administration',
  'sales',
  'construction',
  'creative',
  'education',
  'health',
  'hospitality',
  'agriculture',
  'transport',
  'other',
] as const;
export type WorkField = (typeof WORK_FIELDS)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'temporary', 'freelance'] as const;
export const PLACE_MODES = ['onsite', 'hybrid', 'remote'] as const;
