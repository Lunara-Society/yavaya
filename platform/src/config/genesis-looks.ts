import { LOOK_OPTIONS, lookOption, type Look, type LookPart } from './play-looks';
import type { GenesisGarment, GenesisHair, GenesisShoes } from './genesis';

/**
 * A Genesis character's appearance, as the runtime draws it (docs/GENESIS.md).
 * Until the Genesis studio saves records of its own (phase E), it is worked
 * out from the look a player already has (`genesisFromLook`), so nobody has
 * to remake their character and nothing saved changes.
 */
export type GenesisLook = {
  /** Shape control values (config/genesis.ts), -1…1. */
  controls: Record<string, number>;
  skin: number;
  eyes: 'brown' | 'blue' | 'green';
  hair: GenesisHair | null;
  hairColor: number;
  top: { garment: GenesisGarment; color: number };
  bottom: { garment: GenesisGarment; color: number };
  shoes: { id: GenesisShoes; color: number };
};

/*
 * Today's faces as starting identities: the gender their artwork reads as
 * (the painted faces' -a/-o names agree with it) and a few traits, each a
 * small, safe move from the neutral face. The owner's painted features
 * (freckles, a goatee, eyeliner) come back as skin details and facial hair
 * in later phases.
 */
const FACE: Record<string, { controls: Record<string, number>; eyes?: GenesisLook['eyes'] }> = {
  alegre: { controls: { 'body.gender': 0, 'cheek.fullness': 0.3, 'mouth.width': 0.2 } },
  tranquila: { controls: { 'body.gender': -0.85, 'eye.size': 0.2, 'lip.upper': 0.2 } },
  decidido: { controls: { 'body.gender': 0.85, 'jaw.definition': 0.5, 'chin.width': 0.3 } },
  picara: { controls: { 'body.gender': -0.8, 'eye.angle': 0.4, 'nose.tip': 0.3 } },
  mirada: { controls: { 'body.gender': -0.8, 'eye.size': 0.3, 'cheek.bones': 0.3 } },
  pecas: { controls: { 'body.gender': -0.75, 'nose.width': -0.2, 'cheek.fullness': 0.2 }, eyes: 'green' },
  serena: { controls: { 'body.gender': -0.85, 'lip.lower': 0.3, 'eye.angle': 0.2 } },
  sonrisa: { controls: { 'body.gender': -0.8, 'mouth.width': 0.3, 'cheek.height': 0.2 } },
  radiante: { controls: { 'body.gender': -0.8, 'cheek.bones': 0.4, 'lip.upper': 0.3 } },
  delineado: { controls: { 'body.gender': -0.85, 'eye.angle': 0.5, 'nose.length': -0.2 } },
  ojos_claros: { controls: { 'body.gender': 0.55, 'eye.spacing': 0.2 }, eyes: 'blue' },
  firme: { controls: { 'body.gender': 0.9, 'jaw.definition': 0.6, 'nose.width': 0.2 } },
  sereno: { controls: { 'body.gender': 0.8, 'chin.length': 0.2, 'cheek.bones': 0.2 } },
  franco: { controls: { 'body.gender': 0.85, 'mouth.width': 0.4, 'chin.width': 0.3 } },
  tranquilo: { controls: { 'body.gender': 0.8, 'eye.size': -0.2, 'jaw.definition': 0.3 } },
  guino: { controls: { 'body.gender': -0.8, 'eye.angle': 0.3, 'mouth.width': 0.2 } },
  perilla: { controls: { 'body.gender': 0.9, 'jaw.definition': 0.5, 'chin.projection': 0.3 } },
};

const BODY: Record<string, Record<string, number>> = {
  esbelto: { 'body.muscle': 0.1, 'body.weight': -0.25 },
  fuerte: { 'body.muscle': 0.7, 'body.weight': 0.3 },
};

/** The hairstyles: every Genesis one has a choice (`mono`, a bun on the first character, is the braid and is named so). */
const HAIR: Record<string, GenesisHair> = { corto: 'short02', clasico: 'short04', rizos: 'afro01', coleta: 'ponytail01', largo: 'long01', melena: 'bob02', mono: 'braid01' };

const LONG_SLEEVES = new Set(['chaqueta', 'sudadera', 'camisa']);
const SHOES: Record<string, GenesisShoes> = { tenis: 'sneaker', botas: 'boot', sandalias: 'dress' };

/** The Genesis appearance of a look a player already has. */
export function genesisFromLook(look: Look): GenesisLook {
  const face = FACE[look.face] ?? FACE.alegre!;
  const top = lookOption('top', look.top);
  const bottom = lookOption('bottom', look.bottom);
  const shoes = lookOption('shoes', look.shoes);
  const topShape = top.shape ?? top.id;
  const shoeShape = shoes.shape ?? shoes.id;
  return {
    controls: { ...face.controls, ...(BODY[look.body] ?? BODY.esbelto) },
    skin: lookOption('skin', look.skin).color!,
    eyes: face.eyes ?? 'brown',
    hair: HAIR[look.hair] ?? 'short02',
    hairColor: lookOption('hairColor', look.hairColor).color!,
    top: { garment: LONG_SLEEVES.has(topShape) ? 'longsleeve' : 'tee', color: top.color! },
    bottom: { garment: look.bottom === 'short' ? 'shorts' : 'trousers', color: bottom.color! },
    // Sneakers take the shoe's colour (white, red, gold); boots and dress shoes keep their own leather.
    shoes: { id: SHOES[shoeShape] ?? 'sneaker', color: (SHOES[shoeShape] ?? 'sneaker') === 'sneaker' ? shoes.color! : 0xffffff },
  };
}

/** The parts of a look Genesis draws today; the rest (beards, face paint, prints, glasses, accessories) come in later phases (docs/GENESIS.md). */
export const GENESIS_PARTS: readonly LookPart[] = ['body', 'skin', 'face', 'hair', 'hairColor', 'top', 'bottom', 'shoes'];

/**
 * Faces named after a painted feature Genesis does not draw yet (freckles,
 * eyeliner, a wink, a goatee): offered again when it does. Whoever wears or
 * owns one keeps it; their character has the face's identity meanwhile.
 */
const UNDRAWN_FACES = new Set(['pecas', 'delineado', 'guino', 'perilla']);

/** Clothes Genesis draws as something else: a tank top as a T-shirt, sandals as dress shoes. Back when it has their garments. */
const UNDRAWN: Partial<Record<LookPart, Set<string>>> = { top: new Set(['tirantes']), shoes: new Set(['sandalias']) };

/**
 * Whether Genesis draws this option as it is named. Only these are offered in
 * the Studio and the shop: nothing is shown, sold or won that the character
 * does not wear. Options it does not draw stay on the accounts that have them.
 */
export function genesisDraws(part: LookPart, id: string): boolean {
  if (!GENESIS_PARTS.includes(part)) return false;
  if (part === 'face') return !UNDRAWN_FACES.has(id);
  if (UNDRAWN[part]?.has(id)) return false;
  // A patterned top would be a plain one: its print is not drawn yet.
  if (part === 'top') return !lookOption('top', id).pattern;
  return true;
}

/** The options of a part that Genesis draws, in catalogue order. */
export function genesisOptions(part: LookPart) {
  return LOOK_OPTIONS[part].filter((option) => genesisDraws(part, option.id));
}
