/**
 * Device tiers and the budgets each tier gets. Pure (tested); the device facts
 * come from expo-device at start-up (performance/device.ts).
 */
export type Tier = 'low' | 'mid' | 'high';

export function tierOf(totalMemoryBytes: number | null, yearClass: number | null, reducedMotion: boolean): Tier {
  if (reducedMotion) return 'low';
  const gb = totalMemoryBytes ? totalMemoryBytes / 1024 ** 3 : null;
  if ((gb !== null && gb < 3.5) || (yearClass !== null && yearClass < 2019)) return 'low';
  if (gb !== null && gb >= 7 && (yearClass === null || yearClass >= 2021)) return 'high';
  return 'mid';
}

export type Budget = {
  /** Reconstruction cell size in dp: bigger cells, fewer particles. */
  cell: number;
  /** Layers of inflowing light in the reconstruction shader. */
  lightLayers: 0 | 1 | 2;
  /** Ambient dust particles in the environment. */
  dust: number;
  /** Device-tilt parallax. */
  parallax: boolean;
  /** Frame time (ms) above which quality steps down. */
  frameBudgetMs: number;
};

export const BUDGETS: Record<Tier, Budget> = {
  low: { cell: 7, lightLayers: 0, dust: 0, parallax: false, frameBudgetMs: 34 },
  mid: { cell: 5, lightLayers: 1, dust: 24, parallax: true, frameBudgetMs: 20 },
  high: { cell: 3.5, lightLayers: 2, dust: 48, parallax: true, frameBudgetMs: 17.5 },
};

export const stepDown = (tier: Tier): Tier => (tier === 'high' ? 'mid' : 'low');

/**
 * Frame statistics from a list of frame intervals (ms): average fps, the share
 * of frames over budget, and dropped frames (a frame that took longer than
 * 1.5 vsync intervals counts the vsyncs it missed).
 */
export function frameStats(intervals: readonly number[], vsyncMs = 1000 / 60) {
  if (intervals.length === 0) return { fps: 0, dropped: 0, p95: 0, frames: 0 };
  const total = intervals.reduce((a, b) => a + b, 0);
  const sorted = [...intervals].sort((a, b) => a - b);
  const dropped = intervals.reduce((n, dt) => n + (dt > vsyncMs * 1.5 ? Math.round(dt / vsyncMs) - 1 : 0), 0);
  return { fps: (intervals.length * 1000) / total, dropped, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, frames: intervals.length };
}
