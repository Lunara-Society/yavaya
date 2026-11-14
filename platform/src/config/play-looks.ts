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
 * Most options are everyone's from the first visit. An option with `unlock`
 * is owned only once it is earned (docs/PLAY.md, "Shop and rewards"):
 * bought with Play Coins in the shop (`shop`, its price in PLAY_RULES.shop),
 * won with an achievement (its id), or worn by Yavaya's first members
 * (`founder`). The server checks ownership before it keeps a look.
 * `shape` names the option it is cut like (a gold guayabera is shaped as a
 * guayabera), so a new colourway needs no new geometry.
 */

export const LOOK_PARTS = ['body', 'skin', 'face', 'hair', 'hairColor', 'beard', 'paint', 'top', 'print', 'bottom', 'shoes', 'glasses', 'accessory'] as const;
export type LookPart = (typeof LOOK_PARTS)[number];

export type Look = Record<LookPart, string>;

/**
 * `shop`: bought with Play Coins (earned by playing; PLAY_RULES.shop).
 * `gems`: bought with gems, which are bought with money (PLAY_RULES.gems,
 * PLAY_RULES.gemPacks): the most exclusive looks, never anything that helps
 * win. `founder`: the first members. `vault`: from a product of the Vault
 * (server/domains/play/vault.ts), owned by buying it there. An achievement id: won.
 */
export type Unlock = 'shop' | 'gems' | 'founder' | 'vault' | AchievementId;

/**
 * `image`: a picture in /play/looks/<part>/<id>.webp (a painted face, a beard,
 * face paint, glasses, a print), drawn from the owner's own artwork.
 * `pattern`: a cloth picture tiled over a whole top (/play/looks/pattern/<pattern>.webp).
 */
type Option = { id: string; color?: number; accent?: number; shape?: string; unlock?: Unlock; image?: boolean; pattern?: string };

/**
 * Achievements (docs/PLAY.md): each said in both languages as
 * `play.achievement.<id>` and `.line`, checked by the server from verified
 * runs only (server/domains/play/progress.ts).
 */
export const ACHIEVEMENTS = [
  'primera_prueba',
  'cinco_pruebas',
  'sin_caidas',
  'obsidiana_todas',
  'guardian',
  'ruta_primera',
  'ruta_7',
  'distritos',
  // Proezas: a course without one fall, without a checkpoint, at or under its reference time (the test route's own). Meant to be very hard.
  'proeza_bronce',
  'proeza_plata',
  'proeza_oro',
  'proeza_obsidiana',
  'proeza_guardian',
  'proeza_barrio',
  'proeza_diaspora',
  'proeza_ruta',
  'proeza_total',
] as const;

/** The proezas, by the course they are won on (a day's route counts as `ruta`). */
export const PROEZAS: Record<string, AchievementId> = {
  bronce: 'proeza_bronce',
  plata: 'proeza_plata',
  oro: 'proeza_oro',
  obsidiana: 'proeza_obsidiana',
  guardian: 'proeza_guardian',
  barrio: 'proeza_barrio',
  diaspora: 'proeza_diaspora',
  ruta: 'proeza_ruta',
};
export type AchievementId = (typeof ACHIEVEMENTS)[number];

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
  { id: 'oro', color: 0xd8b25a, unlock: 'shop' },
  { id: 'violeta', color: 0x6a4bb8, unlock: 'shop' },
];

export const LOOK_OPTIONS: Record<LookPart, Option[]> = {
  body: [{ id: 'esbelto' }, { id: 'fuerte' }],
  skin: SKIN,
  face: [
    { id: 'alegre' },
    { id: 'tranquila' },
    { id: 'decidido' },
    { id: 'picara' },
    // Painted faces, from the owner's artwork: their features over the character's own skin.
    ...['mirada', 'pecas', 'serena', 'sonrisa', 'radiante', 'delineado', 'ojos_claros', 'firme', 'sereno', 'franco', 'tranquilo'].map((id) => ({ id, image: true })),
    { id: 'guino', image: true, unlock: 'gems' as const },
    { id: 'perilla', image: true, unlock: 'gems' as const },
  ],
  hair: [{ id: 'corto' }, { id: 'rizos' }, { id: 'coleta' }, { id: 'largo' }, { id: 'mono' }],
  hairColor: HAIR_COLOR,
  beard: [
    { id: 'ninguna' },
    ...['sombra', 'completa', 'candado', 'bigote_perilla', 'blanca', 'rubia'].map((id) => ({ id, image: true })),
    { id: 'charro', image: true, unlock: 'gems' as const },
    { id: 'pelirroja', image: true, unlock: 'gems' as const },
  ],
  paint: [
    { id: 'ninguna' },
    ...['tribal', 'olas', 'estrellas'].map((id) => ({ id, image: true })),
    { id: 'tigre', image: true, unlock: 'proeza_bronce' as const },
    { id: 'copo', image: true, unlock: 'proeza_plata' as const },
    { id: 'llamas_doradas', image: true, unlock: 'proeza_oro' as const },
    { id: 'neon', image: true, unlock: 'proeza_obsidiana' as const },
    ...['rayos', 'leopardo', 'cerezo', 'gato', 'fuego'].map((id) => ({ id, image: true, unlock: 'gems' as const })),
  ],
  // `color` is the cloth, `accent` a detail (collar, stripe, cuffs).
  top: [
    { id: 'camiseta', color: 0xd8b25a, accent: 0xf6efe0 },
    { id: 'guayabera', color: 0xf3ead8, accent: 0xd8c9a8 },
    { id: 'chaqueta', color: 0x2f6f8f, accent: 0xd8b25a },
    { id: 'sudadera', color: 0xc8553d, accent: 0xf2e6d6 },
    { id: 'camisa', color: 0x6f8f4e, accent: 0xe9e2cf },
    { id: 'tirantes', color: 0x8a5ab8, accent: 0xf3d27a },
    { id: 'guayabera_oro', color: 0xe3c271, accent: 0xa87a2c, shape: 'guayabera', unlock: 'shop' },
    { id: 'sudadera_volcan', color: 0x3a1a12, accent: 0xff7a2a, shape: 'sudadera', unlock: 'shop' },
    { id: 'chaqueta_obsidiana', color: 0x221f29, accent: 0xc9a24a, shape: 'chaqueta', unlock: 'obsidiana_todas' },
    { id: 'camuflaje', color: 0x5a5f5a, accent: 0x2f322f, shape: 'camiseta', pattern: 'camuflaje' },
    { id: 'tie_dye', color: 0x6a4a7a, accent: 0x2a1f30, shape: 'camiseta', pattern: 'tie_dye', unlock: 'obsidiana_todas' },
    { id: 'galaxia', color: 0x1d2a5a, accent: 0x0d1430, shape: 'camiseta', pattern: 'galaxia', unlock: 'gems' },
    { id: 'cuadros', color: 0x8a1f1f, accent: 0x1a1a1a, shape: 'camisa', pattern: 'cuadros', unlock: 'gems' },
    // The Vault's first wearable editions (Legado Obsidiana, Reino de Sombra).
    { id: 'legado_obsidiana', color: 0x15131a, accent: 0xd4a843, shape: 'chaqueta', unlock: 'vault' },
    { id: 'reino_sombrio', color: 0x23123a, accent: 0xa66bff, shape: 'sudadera', unlock: 'vault' },
  ],
  print: [
    { id: 'ninguno' },
    ...['lobo', 'atardecer', 'mariposa', 'ola'].map((id) => ({ id, image: true })),
    // The dragon, lightning, tribal and claw prints were taken out (14 November 2026): broken cut-outs, and
    // the claw read as blood. The Ruta proeza gives the tree instead; no one could have paid for the others.
    { id: 'arbol', image: true, unlock: 'proeza_ruta' as const },
    { id: 'lobo_dorado', image: true, unlock: 'proeza_total' as const },
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
    { id: 'tenis_dorados', color: 0xe3c271, accent: 0xf6efe0, shape: 'tenis', unlock: 'shop' },
  ],
  glasses: [
    { id: 'ninguno' },
    ...['clasicos', 'aviador', 'redondos', 'transparentes', 'carey'].map((id) => ({ id, image: true })),
    { id: 'steampunk', image: true, unlock: 'proeza_barrio' as const },
    { id: 'sol_y_luna', image: true, unlock: 'proeza_diaspora' as const },
    { id: 'visor', image: true, unlock: 'proeza_guardian' as const },
    ...['arcoiris', 'persiana', 'neon', 'corazon'].map((id) => ({ id, image: true, unlock: 'gems' as const })),
  ],
  accessory: [
    { id: 'ninguno' },
    { id: 'gorra', color: 0x2f6f8f, accent: 0xf2efe6 },
    { id: 'lentes', color: 0x1c1a1e, accent: 0x7fb6c9 },
    { id: 'sombrero', color: 0xe2c98a, accent: 0x6b4429 },
    { id: 'mochila', color: 0xc8553d, accent: 0x6b4429 },
    { id: 'sombrero_fundador', color: 0x2a2018, accent: 0xd8b25a, shape: 'sombrero', unlock: 'founder' },
    { id: 'sombrero_guardian', color: 0x221f29, accent: 0xff7a2a, shape: 'sombrero', unlock: 'guardian' },
    { id: 'gorra_ruta', color: 0xc8553d, accent: 0xd8b25a, shape: 'gorra', unlock: 'ruta_7' },
  ],
};

export const DEFAULT_LOOK: Look = {
  body: 'esbelto',
  skin: 'canela',
  face: 'alegre',
  hair: 'corto',
  hairColor: 'negro',
  beard: 'ninguna',
  paint: 'ninguna',
  top: 'camiseta',
  print: 'ninguno',
  bottom: 'jeans',
  shoes: 'tenis',
  glasses: 'ninguno',
  accessory: 'ninguno',
};

/** Where an option's picture is, if it has one. */
export function lookImage(part: LookPart, id: string): string | null {
  const option = LOOK_OPTIONS[part].find((o) => o.id === id);
  if (option?.pattern) return `/play/looks/pattern/${option.pattern}.webp`;
  return option?.image ? `/play/looks/${part}/${id}.webp` : null;
}

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

/** A look with every option replaced by the one it is cut like: what the character builder shapes. */
export function shapesOf(look: Look): Look {
  const out = { ...look };
  for (const part of LOOK_PARTS) out[part] = lookOption(part, look[part]).shape ?? lookOption(part, look[part]).id;
  return out;
}

/** What it takes to own an option; undefined for the options everyone has. */
export function unlockOf(part: LookPart, id: string): Unlock | undefined {
  return LOOK_OPTIONS[part].find((option) => option.id === id)?.unlock;
}

/** Every option that has to be earned, as `part:id`. */
export function earnedItems(): Array<{ item: string; part: LookPart; id: string; unlock: Unlock }> {
  return LOOK_PARTS.flatMap((part) => LOOK_OPTIONS[part].filter((o) => o.unlock).map((o) => ({ item: `${part}:${o.id}`, part, id: o.id, unlock: o.unlock! })));
}

/**
 * A look with nothing worn twice in one place: the sunglasses accessory and
 * a pair of glasses both sit on the eyes, so putting on one takes off the
 * other. `changed` is the part just chosen (it wins).
 */
export function withoutClash(look: Look, changed: LookPart): Look {
  if (changed === 'glasses' && look.glasses !== DEFAULT_LOOK.glasses && look.accessory === 'lentes') return { ...look, accessory: DEFAULT_LOOK.accessory };
  if (changed === 'accessory' && look.accessory === 'lentes' && look.glasses !== DEFAULT_LOOK.glasses) return { ...look, glasses: DEFAULT_LOOK.glasses };
  return look;
}

/** The parts of a look the player has to own, as `part:id`. */
export function lockedParts(look: Look): string[] {
  return LOOK_PARTS.filter((part) => unlockOf(part, look[part])).map((part) => `${part}:${look[part]}`);
}
