/**
 * Yavaya Synapse design tokens (Chapter 03). Pure data: no React Native
 * imports, so tests and tools can read it.
 *
 * Language: absolute black, controlled light, glass and a restrained metal.
 * Light is information: an element is lit because it is focused, active or
 * important, never for decoration. One district accent on screen at a time.
 */

export const color = {
  /** The void. Every screen starts here. */
  void: '#000000',
  /** Atmospheric darkness: faint blue-violet lifts of black, for depth, never grey fills. */
  abyss: '#04050A',
  deep: '#080A12',
  /** Glass panels: dark, translucent, lit at the edge. */
  glass: 'rgba(14,17,26,0.78)',
  glassRaised: 'rgba(20,24,36,0.86)',
  hairline: 'rgba(200,214,255,0.12)',
  hairlineStrong: 'rgba(200,214,255,0.22)',
  /** Text: cool light, never pure white. */
  text: '#ECEFF6',
  textSecondary: 'rgba(236,239,246,0.66)',
  textTertiary: 'rgba(236,239,246,0.44)',
  /** System light: focus, links, the interface's own signal. */
  signal: '#9CC9FF',
  /** Restrained metal: primary actions and the brand, hairlines only. */
  metal: '#C9A96E',
  metalSoft: 'rgba(201,169,110,0.32)',
  /** Roxi's Presence (from the Halo decision: violet light). */
  roxi: '#B9A3FF',
  /** States. */
  positive: '#5FE0A5',
  caution: '#F2C266',
  critical: '#FF6B76',
} as const;

export type DistrictId =
  | 'mercadito' | 'services' | 'work' | 'yavayago' | 'community' | 'sanctuary' | 'animals'
  | 'hogar' | 'movilidad' | 'salud' | 'aprender' | 'negocios' | 'campo' | 'barrio' | 'diaspora';

/** One accent per district. Pairwise ΔE ≥ 20 and ≥ 7:1 on black (design.test.ts). */
export const districtAccent: Record<DistrictId, string> = {
  mercadito: '#3FD69B',
  services: '#6FB2FF',
  work: '#EBC062',
  yavayago: '#FF8C4A',
  community: '#F27DA9',
  sanctuary: '#F4E9CF',
  animals: '#9DDB63',
  hogar: '#D9A27E',
  movilidad: '#4FD4F0',
  salud: '#8CEFD6',
  aprender: '#FF7584',
  negocios: '#A9BDD3',
  campo: '#DDE07A',
  barrio: '#E58BEA',
  diaspora: '#4FAFA3',
};

/** Typography: Geist for words, Geist Mono for numbers and data (both SIL OFL 1.1). */
export const font = {
  light: 'Geist_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const type = {
  display: { fontFamily: font.light, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: font.regular, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  headline: { fontFamily: font.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  /** Overlines and data labels: never below 12 px. */
  micro: { fontFamily: font.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
  data: { fontFamily: font.mono, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
} as const;

export type TypeVariant = keyof typeof type;

/** 4-point grid. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;
export const radius = { control: 10, panel: 18, sheet: 26, pill: 999 } as const;

/** Touch: 48 dp minimum target; primary actions live in the lower 40 % (thumb zone). */
export const touch = { minTarget: 48, thumbZone: 0.4, edgeGesture: 24 } as const;

/**
 * Depth hierarchy. Each layer is darker, lit less and moves less than the one
 * above it. Parallax is the share of tilt a layer follows.
 */
export const depth = {
  environment: { z: 0, parallax: 0.15, edgeLight: 0 },
  structure: { z: 1, parallax: 0.35, edgeLight: 0.15 },
  panel: { z: 2, parallax: 0.6, edgeLight: 0.35 },
  focus: { z: 3, parallax: 0.8, edgeLight: 0.6 },
  overlay: { z: 4, parallax: 0.2, edgeLight: 0.45 },
  system: { z: 5, parallax: 0, edgeLight: 0 },
} as const;

/** Motion tokens (Chapter 06 uses them everywhere). Milliseconds. */
export const duration = {
  instant: 90,
  quick: 160,
  base: 240,
  emphasis: 360,
  district: 520,
  cinematic: 1400,
} as const;

/** Cubic bezier control points. */
export const easing = {
  standard: [0.2, 0, 0, 1],
  decelerate: [0.05, 0.7, 0.1, 1],
  accelerate: [0.3, 0, 0.8, 0.15],
  linear: [0, 0, 1, 1],
} as const;

/** Spring presets (Reanimated): physically believable, no bounce past rest for UI. */
export const spring = {
  snappy: { damping: 26, stiffness: 320, mass: 1 },
  smooth: { damping: 28, stiffness: 190, mass: 1 },
  gentle: { damping: 30, stiffness: 120, mass: 1 },
} as const;

/** Relative luminance and contrast (WCAG 2.x), for tests and runtime checks. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Hex to [r,g,b] in 0..1, for shader uniforms. */
export function rgb01(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
