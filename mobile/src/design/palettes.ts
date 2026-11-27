import { color } from './tokens.ts';
import { aether } from './aether.ts';

/**
 * The colours the shared components read (Text, controls, Screen, HoloPanel),
 * by role, for each native look. Synapse is exactly today's tokens, so the
 * default look does not change; Aether is the permanent visual language
 * (VISUAL_LANGUAGE §2). Pure data, so tests can check both.
 */
export type NativeLook = 'synapse' | 'aether';

export type Palette = {
  look: NativeLook;
  void: string;
  /** An empty photo tile, a placeholder surface. */
  deep: string;
  glass: string;
  glassRaised: string;
  hairline: string;
  hairlineStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** A focused field's edge, a switch that is on. */
  focus: string;
  /** The track behind a switch that is on, and behind one that is off. */
  trackOn: string;
  trackOff: string;
  /** Links in running text. */
  link: string;
  linkUnderline: boolean;
  /** The primary action: its edge and words, and its fill. */
  metal: string;
  metalFill: string;
  /** Roxi's light. */
  roxi: string;
  positive: string;
  caution: string;
  critical: string;
};

export const SYNAPSE: Palette = {
  look: 'synapse',
  void: color.void,
  deep: color.deep,
  glass: color.glass,
  glassRaised: color.glassRaised,
  hairline: color.hairline,
  hairlineStrong: color.hairlineStrong,
  text: color.text,
  textSecondary: color.textSecondary,
  textTertiary: color.textTertiary,
  focus: color.signal,
  trackOn: 'rgba(156,201,255,0.28)',
  trackOff: 'rgba(255,255,255,0.08)',
  link: color.signal,
  linkUnderline: false,
  metal: color.metal,
  metalFill: 'rgba(201,169,110,0.10)',
  roxi: color.roxi,
  positive: color.positive,
  caution: color.caution,
  critical: color.critical,
};

export const AETHER: Palette = {
  look: 'aether',
  void: aether.void,
  deep: aether.obsidian2,
  glass: 'rgba(24,24,27,0.86)',
  glassRaised: 'rgba(24,24,27,0.92)',
  hairline: 'rgba(138,116,72,0.35)',
  hairlineStrong: 'rgba(201,169,110,0.42)',
  text: aether.silverText,
  textSecondary: aether.silverSecondary,
  textTertiary: aether.titaniumMid,
  focus: aether.champagneLit,
  trackOn: 'rgba(226,194,122,0.22)',
  trackOff: 'rgba(139,144,153,0.18)',
  link: aether.silverText,
  linkUnderline: true,
  metal: aether.champagneRest,
  metalFill: 'rgba(201,169,110,0.12)',
  roxi: aether.champagneLit,
  positive: color.positive,
  caution: color.caution,
  critical: color.critical,
};

export const PALETTES: Record<NativeLook, Palette> = { synapse: SYNAPSE, aether: AETHER };
