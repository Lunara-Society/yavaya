/**
 * Pure mixing rules (tested): which voices keep playing when a new one asks,
 * and the gain each gets under ducking.
 */
export type Voice = { id: number; priority: number; startedAt: number };

export const MAX_VOICES = 3;
export const DUCKED = 0.25;

/** Returns the voices to stop so that `incoming` can play, or null if it should be dropped. */
export function admit(active: readonly Voice[], incoming: Voice, max = MAX_VOICES): Voice[] | null {
  if (active.length < max) return [];
  const weakest = [...active].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
  return weakest.priority <= incoming.priority ? [weakest] : null;
}

export function effectiveGain(base: number, master: number, ducked: boolean): number {
  const g = base * master * (ducked ? DUCKED : 1);
  return Math.max(0, Math.min(1, g));
}

/** Volume steps for a linear fade over `ms` at ~60 Hz. */
export function fadeSteps(from: number, to: number, ms: number, hz = 60): number[] {
  const n = Math.max(1, Math.round((ms / 1000) * hz));
  return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
}
