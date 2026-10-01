/**
 * Espacio Violeta: names, professions and report reasons.
 *
 * A name here is never the Yavaya name or YAY ID. It is a word and a number,
 * easy to remember ("Luna 27"), so two women who talked last week can find
 * each other again without either knowing who the other is.
 *
 * Women and professionals draw from different word lists — flowers, sky and
 * sea for women, trees for professionals — and a professional always carries
 * a badge as well, so nobody mistakes one for the other.
 */
export const MEMBER_WORDS = [
  'Luna', 'Brisa', 'Aurora', 'Perla', 'Estrella', 'Gardenia', 'Orquídea', 'Jazmín',
  'Lirio', 'Azucena', 'Margarita', 'Dalia', 'Camelia', 'Magnolia', 'Hortensia', 'Amapola',
  'Gaviota', 'Paloma', 'Golondrina', 'Colibrí', 'Mariposa', 'Libélula', 'Lluvia', 'Nube',
  'Marea', 'Coral', 'Ámbar', 'Canela', 'Vainilla', 'Miel', 'Rocío', 'Alba',
  'Azahar', 'Begonia', 'Clavel', 'Gema', 'Iris', 'Lavanda', 'Malva', 'Nácar',
] as const;

export const PROFESSIONAL_WORDS = [
  'Ceiba', 'Roble', 'Cedro', 'Laurel', 'Caoba', 'Guayacán', 'Almendro', 'Olivo',
  'Sauce', 'Malinche', 'Guanacaste', 'Jícaro', 'Madroño', 'Nogal', 'Pino', 'Ébano',
] as const;

/** i18n: `violeta.profession.<key>`. Both need a licence a person verified. */
export const PROFESSIONS = ['psychology', 'psychiatry'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** i18n: `violeta.report.category.<key>`. */
export const SAFE_SPACE_REPORT_CATEGORIES = ['not_a_woman', 'harassment', 'threat', 'exposure', 'scam', 'other'] as const;
export type SafeSpaceReportCategory = (typeof SAFE_SPACE_REPORT_CATEGORIES)[number];

/** Every pledge must be accepted to enter. i18n: `violeta.pledge.<key>`. */
export const MEMBER_PLEDGES = ['woman', 'confidential', 'respect', 'not_emergency'] as const;
export const PROFESSIONAL_PLEDGES = ['confidential', 'professional', 'not_emergency'] as const;
