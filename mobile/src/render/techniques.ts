/**
 * The reconstruction techniques (Chapter 05) and their timing presets. Pure
 * data (tested). The ids match the `technique` uniform of RECON_SKSL.
 */
export const TECHNIQUES = [
  { id: 0, key: 'particles', es: 'Ensamblaje de partículas', en: 'Particle assembly' },
  { id: 1, key: 'data', es: 'Reconstrucción de datos', en: 'Spatial data reconstruction' },
  { id: 2, key: 'fragments', es: 'Fragmentación de superficie', en: 'Surface fragmentation' },
  { id: 3, key: 'light', es: 'Emergencia de luz', en: 'Volumetric light emergence' },
  { id: 4, key: 'mesh', es: 'Malla geométrica', en: 'Geometric mesh' },
  { id: 5, key: 'wave', es: 'Onda digital', en: 'Digital wave propagation' },
  { id: 6, key: 'molecular', es: 'Disolución molecular', en: 'Soft molecular dissolution' },
] as const;

export type TechniqueKey = (typeof TECHNIQUES)[number]['key'];
export const techniqueId = (key: TechniqueKey): number => TECHNIQUES.find((t) => t.key === key)!.id;

/** ms. Frequent navigation is short; districts sit in 400–700; cinematic is opt-in only. */
export const PRESETS = { frequent: 260, district: 520, roxi: 900, cinematic: 1800 } as const;
export type Preset = keyof typeof PRESETS;

/**
 * Yavaya's signature (chosen in Chapter 05 from the comparison): light
 * emergence for arrivals of a whole place or a being (districts, Roxi, the
 * Guardian), the digital wave for frequent moves because it starts where the
 * finger touched and finishes fastest, and molecular dissolution for leaving.
 */
export const SIGNATURE = { arrive: 'light', frequent: 'wave', leave: 'molecular' } as const satisfies Record<string, TechniqueKey>;

/** Time left for a run that starts from `from` (an interrupted run continues from where it is). */
export function remainingMs(from: number, to: number, totalMs: number): number {
  return Math.round(Math.abs(to - from) * totalMs);
}
