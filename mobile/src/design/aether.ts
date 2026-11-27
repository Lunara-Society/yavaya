/* eslint-disable ts-patterns/no-magic-numbers -- a design-token table: every number is a named token value (VISUAL_LANGUAGE §2, §5, §6), as in tokens.ts */
/**
 * Aether: Yavaya's permanent visual language (AX-04,
 * docs/aether/VISUAL_LANGUAGE.md). Pure data, like tokens.ts, so tests and
 * tools can read it. The look is opt-in from Settings until the owner approves
 * it on the phone; the Synapse look and Classic stay as they are.
 *
 * Absolute black, deep obsidian, restrained champagne gold, optical silver and
 * titanium. Light is information: only what is selected or touched is lit.
 */
export const aether = {
  void: '#000000',
  /** Deep obsidian: environment, structure, panels. Never grey fills. */
  obsidian1: '#0A0A0B',
  obsidian2: '#111113',
  obsidian3: '#18181B',
  /** Restrained champagne: at most two champagne elements on a screen. */
  champagneDeep: '#8A7448', // edges at rest; never words
  champagneRest: '#C9A96E', // primary actions, the focus ring at rest
  champagneLit: '#E2C27A', // the light of what is selected
  champagneHot: '#F4E6C4', // the peak of a press, at most 160 ms
  /** Optical silver for words, titanium for structure. */
  silverText: '#ECEFF6',
  silverSecondary: '#C9CED6',
  titaniumLight: '#B4B9C1',
  titaniumMid: '#8B9099',
  titaniumDark: '#5D626B', // lines only; never words
} as const;

/** Rendering levels (PRODUCTION_ARCHITECTURE §6). L0 is Classic, outside the native shell. */
export type Level = 4 | 3 | 2 | 1;
export const LEVELS: readonly Level[] = [4, 3, 2, 1];

/** The device tier picks the starting level; the quality governor can only step it down. */
const TIER_LEVEL: Record<'low' | 'mid' | 'high', Level> = { high: 4, mid: 3, low: 2 };
export function levelFor(tier: 'low' | 'mid' | 'high'): Level {
  return TIER_LEVEL[tier];
}

/** Blur is the most expensive effect: one region per screen at most, none below L3. */
export const BLUR_MAX: Record<Level, number> = { 4: 20, 3: 12, 2: 0, 1: 0 };

/** Light limits (VISUAL_LANGUAGE §5). Milliseconds and dp. */
export const LIGHT = {
  bloomRadius: 12,
  bloomStrength: 0.35,
  pressPeakMs: 160,
  settleMs: 160,
  /** How much the lower planes darken while something is focused. */
  dimLowerPlanes: 0.35,
  /** Every light change ends within this; nothing loops. */
  maxLightMs: 1400,
} as const;

export type MaterialName =
  | 'obsidian'
  | 'crystal'
  | 'liquidGlass'
  | 'frosted'
  | 'refractive'
  | 'titanium'
  | 'champagneMetal'
  | 'spectral'
  | 'adaptiveOpacity'
  | 'microStructure';

/** How one material is drawn at one level. */
export type MaterialVariant = {
  /** shader: Skia (one canvas, few per screen); views: plain views; flat: one solid colour; none: not drawn. */
  draw: 'shader' | 'views' | 'flat' | 'none';
  /** Body colour and its opacity. */
  tint: string;
  opacity: number;
  /** Edge at rest and when focused (colours with alpha). */
  edge: string;
  edgeLit: string;
  /** dp; 0 is none. */
  blur: number;
  /** Background displacement, 0 to 0.2. */
  refraction: number;
  /** Highlight under the finger, 0 to 1. */
  specular: number;
  /** Surface grain, 0 to 1. */
  grain: number;
  /** Microscopic luminous lattice opacity, 0 to 0.08, shown only when focused. */
  micro: number;
};

const EDGE_REST = 'rgba(138,116,72,0.35)'; // champagneDeep at 35 %
const EDGE_LIT = aether.champagneLit;
const NONE = { blur: 0, refraction: 0, specular: 0, grain: 0, micro: 0 };

/** One material's four levels from its L4 description and what each lower level keeps. */
function ladder(full: MaterialVariant, balanced: Partial<MaterialVariant>, lite: Partial<MaterialVariant>, basic: Partial<MaterialVariant> = {}): Record<Level, MaterialVariant> {
  const l3 = { ...full, ...balanced };
  const l2 = { ...l3, ...NONE, draw: 'views' as const, ...lite };
  const l1 = { ...l2, draw: 'flat' as const, edge: EDGE_REST, ...basic };
  return { 4: full, 3: l3, 2: l2, 1: l1 };
}

/** The ten materials of the owner's AX-04 text (VISUAL_LANGUAGE §6). */
export const MATERIALS: Record<MaterialName, Record<Level, MaterialVariant>> = {
  obsidian: ladder(
    { draw: 'views', tint: aether.obsidian3, opacity: 0.9, edge: EDGE_REST, edgeLit: EDGE_LIT, ...NONE, grain: 0.04 },
    {},
    {},
  ),
  crystal: ladder(
    { draw: 'shader', tint: aether.obsidian2, opacity: 0.92, edge: 'rgba(201,169,110,0.55)', edgeLit: EDGE_LIT, blur: 0, refraction: 0.12, specular: 0.5, grain: 0, micro: 0.05 },
    { refraction: 0, micro: 0.04 },
    { opacity: 0.92 },
  ),
  liquidGlass: ladder(
    { draw: 'shader', tint: aether.obsidian3, opacity: 0.86, edge: EDGE_REST, edgeLit: EDGE_LIT, blur: 0, refraction: 0.08, specular: 0.4, grain: 0.03, micro: 0.03 },
    { refraction: 0 },
    { opacity: 0.86 },
  ),
  frosted: ladder(
    { draw: 'shader', tint: aether.obsidian3, opacity: 0.72, edge: EDGE_REST, edgeLit: EDGE_LIT, blur: 20, refraction: 0, specular: 0.2, grain: 0.05, micro: 0 },
    { blur: 12 },
    { opacity: 0.92 },
  ),
  refractive: ladder(
    { draw: 'shader', tint: aether.obsidian2, opacity: 0.5, edge: 'rgba(201,169,110,0.5)', edgeLit: EDGE_LIT, blur: 0, refraction: 0.2, specular: 0.6, grain: 0, micro: 0 },
    { refraction: 0, opacity: 0.86 },
    { opacity: 0.9 },
  ),
  titanium: ladder(
    { draw: 'views', tint: aether.titaniumMid, opacity: 1, edge: 'rgba(180,185,193,0.6)', edgeLit: aether.titaniumLight, ...NONE, specular: 0.3 },
    {},
    {},
  ),
  champagneMetal: ladder(
    { draw: 'views', tint: aether.champagneRest, opacity: 1, edge: aether.champagneRest, edgeLit: aether.champagneLit, ...NONE, specular: 0.5 },
    {},
    {},
  ),
  spectral: ladder(
    { draw: 'shader', tint: aether.champagneLit, opacity: 0.6, edge: 'rgba(244,230,196,0.5)', edgeLit: aether.champagneHot, blur: 0, refraction: 0.05, specular: 0.3, grain: 0, micro: 0.04 },
    { refraction: 0 },
    { opacity: 0.4 },
    { draw: 'none' },
  ),
  adaptiveOpacity: ladder(
    { draw: 'views', tint: aether.obsidian3, opacity: 0.86, edge: EDGE_REST, edgeLit: EDGE_LIT, ...NONE },
    {},
    { opacity: 0.92 },
  ),
  microStructure: ladder(
    { draw: 'shader', tint: aether.champagneLit, opacity: 0, edge: 'rgba(0,0,0,0)', edgeLit: 'rgba(226,194,122,0.08)', ...NONE, micro: 0.08 },
    { micro: 0.06 },
    { micro: 0 },
    { draw: 'none' },
  ),
};
