/**
 * Animales: the welfare guide and its quiz.
 *
 * The guide's text and every question, option and explanation are i18n keys:
 * `animals.guide.<section>.title|text` and `animals.quiz.<n>.q|a|b|c|why`.
 * `correct` is the index of the right option. A question that teaches nothing
 * does not belong here: each explanation says why the answer matters.
 */
export const GUIDE_SECTIONS = ['water_food', 'shelter', 'chains', 'vet', 'sterilise', 'training', 'heat', 'responsibility'] as const;

export const QUIZ: ReadonlyArray<{ id: number; correct: 0 | 1 | 2 }> = [
  { id: 1, correct: 1 },
  { id: 2, correct: 1 },
  { id: 3, correct: 0 },
  { id: 4, correct: 2 },
  { id: 5, correct: 1 },
  { id: 6, correct: 0 },
  { id: 7, correct: 1 },
  { id: 8, correct: 1 },
  { id: 9, correct: 1 },
  { id: 10, correct: 1 },
];

export const SPECIES = ['dog', 'cat', 'other'] as const;
export const SEXES = ['male', 'female', 'unknown'] as const;
export const SIZES = ['small', 'medium', 'large'] as const;
export const RESCUER_KINDS = ['person', 'organisation'] as const;

/** The application form's closed answers. Open answers are free text. */
export const HOME_TYPES = ['house', 'apartment', 'farm', 'other'] as const;
export const TENURES = ['own', 'rent', 'family'] as const;
export const YES_NO_NA = ['yes', 'no', 'na'] as const;
export const SLEEPS = ['inside', 'outside_sheltered', 'other'] as const;

/** Every one must be accepted. They are the point of the form. */
export const COMMITMENTS = ['no_chain', 'vaccinate', 'sterilise', 'vet_care', 'return_not_abandon', 'follow_up'] as const;
