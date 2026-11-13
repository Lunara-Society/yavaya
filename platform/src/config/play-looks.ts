/**
 * Yavaya Play: what a character can look like (docs/PLAY.md).
 *
 * Plain data, read by the game to build the character and by the server to
 * refuse a look it does not know: a saved look is a set of these ids and
 * nothing else, so no client can store a colour or a part the game never
 * offered. Each id's name is the i18n key `play.look.<part>.<id>`.
 *
 * Ids are stored in accounts. Never rename or reuse one; retire it by
 * leaving it out of a list, and `parseLook` puts the default in its place.
 *
 * `starter` items are everyone's from the first visit. Items that will be
 * earned arrive with the shop (step 7) and carry a price there, not here.
 */

export const LOOK_PARTS = ['body', 'skin', 'face', 'hair', 'hairColor', 'top', 'bottom', 'shoes', 'accessory'] as const;
export type LookPart = (typeof LOOK_PARTS)[number];

export type Look = Record<LookPart, string>;

type Option = { id: string; color?: number; accent?: number };

/** Skin tones, from light to deep: the range of the people the site is for. */
const SKIN: Option[] = [
  { id: 'arena', color: 0xf1c9a5 },
  { id: 'miel', color: 0xdba57a },
  { id: 'canela', color: 0xc68a5f },
  { id: 'cacao', color: 0xa06a45 },
  { id: 'cafe', color: 0x7a4b2e },
  { id: 'ebano', color: 0x4f3020 },
];

const HAIR_COLOR: Option[] = [
  { id: 'negro', color: 0x1d1714 },
  { id: 'castano', color: 0x4a2e1e },
  { id: 'avellana', color: 0x7a4a2a },
  { id: 'cobre', color: 0xa0522d },
  { id: 'rubio', color: 0xd9b56b },
  { id: 'cano', color: 0xcfcac2 },
  { id: 'turquesa', color: 0x2fa3a0 },
  { id: 'rosa', color: 0xd96b9a },
];

export const LOOK_OPTIONS: Record<LookPart, Option[]> = {
  body: [{ id: 'esbelto' }, { id: 'fuerte' }],
  skin: SKIN,
  face: [{ id: 'alegre' }, { id: 'tranquila' }, { id: 'decidido' }, { id: 'picara' }],
  hair: [{ id: 'corto' }, { id: 'rizos' }, { id: 'coleta' }, { id: 'largo' }, { id: 'mono' }],
  hairColor: HAIR_COLOR,
  // `color` is the cloth, `accent` a detail (collar, stripe, cuffs).
  top: [
    { id: 'camiseta', color: 0xd8b25a, accent: 0xf6efe0 },
    { id: 'guayabera', color: 0xf3ead8, accent: 0xd8c9a8 },
    { id: 'chaqueta', color: 0x2f6f8f, accent: 0xd8b25a },
    { id: 'sudadera', color: 0xc8553d, accent: 0xf2e6d6 },
    { id: 'camisa', color: 0x6f8f4e, accent: 0xe9e2cf },
    { id: 'tirantes', color: 0x8a5ab8, accent: 0xf3d27a },
  ],
  bottom: [
    { id: 'jeans', color: 0x2b3a67, accent: 0x3c4f86 },
    { id: 'short', color: 0xc9b48a, accent: 0xb09a70 },
    { id: 'jogger', color: 0x3a3a44, accent: 0xd8b25a },
    { id: 'lino', color: 0xe8dfcc, accent: 0xcfc4ad },
  ],
  shoes: [
    { id: 'tenis', color: 0xf2efe6, accent: 0xd8b25a },
    { id: 'botas', color: 0x6b4429, accent: 0x3e2717 },
    { id: 'sandalias', color: 0x8a5a36, accent: 0x5a3a22 },
    { id: 'tenis_rojos', color: 0xd2453a, accent: 0xf2efe6 },
  ],
  accessory: [
    { id: 'ninguno' },
    { id: 'gorra', color: 0x2f6f8f, accent: 0xf2efe6 },
    { id: 'lentes', color: 0x1c1a1e, accent: 0x7fb6c9 },
    { id: 'sombrero', color: 0xe2c98a, accent: 0x6b4429 },
    { id: 'mochila', color: 0xc8553d, accent: 0x6b4429 },
  ],
};

export const DEFAULT_LOOK: Look = {
  body: 'esbelto',
  skin: 'canela',
  face: 'alegre',
  hair: 'corto',
  hairColor: 'negro',
  top: 'camiseta',
  bottom: 'jeans',
  shoes: 'tenis',
  accessory: 'ninguno',
};

export function lookOption(part: LookPart, id: string): Option {
  return LOOK_OPTIONS[part].find((option) => option.id === id) ?? LOOK_OPTIONS[part].find((option) => option.id === DEFAULT_LOOK[part])!;
}

/**
 * A look from anything (a request body, local storage, an old save): only
 * known parts and known ids survive; anything missing or unknown is the
 * default. Null when it is not even an object.
 */
export function parseLook(value: unknown): Look | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const look = { ...DEFAULT_LOOK };
  for (const part of LOOK_PARTS) {
    const id = given[part];
    if (typeof id === 'string' && LOOK_OPTIONS[part].some((option) => option.id === id)) look[part] = id;
  }
  return look;
}
