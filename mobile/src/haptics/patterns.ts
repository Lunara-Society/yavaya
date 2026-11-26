/**
 * Haptic patterns (Chapter 07). A pattern is a short list of pulses with
 * offsets in ms, timed to land on the visual event they belong to. Pure data.
 */
export type Pulse = { at: number; kind: 'selection' | 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' | 'success' | 'warning' | 'error' };

export const PATTERNS = {
  tap: [{ at: 0, kind: 'selection' }],
  open: [{ at: 0, kind: 'light' }],
  districtOpen: [{ at: 0, kind: 'soft' }, { at: 260, kind: 'light' }],
  back: [{ at: 0, kind: 'selection' }],
  reconstruct: [{ at: 0, kind: 'soft' }, { at: 180, kind: 'soft' }, { at: 360, kind: 'light' }],
  dissolve: [{ at: 0, kind: 'soft' }],
  roxi: [{ at: 0, kind: 'soft' }, { at: 220, kind: 'medium' }],
  guardian: [{ at: 0, kind: 'medium' }, { at: 420, kind: 'soft' }],
  awaken: [{ at: 0, kind: 'soft' }, { at: 900, kind: 'soft' }, { at: 2000, kind: 'medium' }, { at: 3400, kind: 'light' }],
  expand: [{ at: 0, kind: 'light' }],
  success: [{ at: 0, kind: 'success' }],
  notify: [{ at: 0, kind: 'light' }, { at: 120, kind: 'light' }],
  error: [{ at: 0, kind: 'error' }],
  longPress: [{ at: 0, kind: 'rigid' }],
} as const satisfies Record<string, readonly Pulse[]>;

export type PatternName = keyof typeof PATTERNS;
