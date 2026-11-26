import { frameStats } from '../performance/tier.ts';

/** Measured transitions (Chapter 06): what each took, frames dropped, touch-to-motion latency. */
export type TransitionRecord = {
  kind: string;
  to: string;
  plannedMs: number;
  actualMs: number;
  fps: number;
  dropped: number;
  latencyMs: number | null;
};

const log: TransitionRecord[] = [];
const listeners = new Set<() => void>();

export function recordTransition(kind: string, to: string, plannedMs: number, frameTimes: number[], tapAt: number | null): void {
  const intervals = frameTimes.slice(1).map((t, i) => t - frameTimes[i]);
  const stats = frameStats(intervals);
  const actual = frameTimes.length > 1 ? frameTimes[frameTimes.length - 1] - frameTimes[0] : 0;
  const latency = tapAt !== null && frameTimes.length ? Math.max(0, frameTimes[0] - tapAt) : null;
  log.push({ kind, to, plannedMs, actualMs: Math.round(actual), fps: Math.round(stats.fps), dropped: stats.dropped, latencyMs: latency === null ? null : Math.round(latency) });
  if (log.length > 40) log.shift();
  listeners.forEach((l) => l());
  console.log(`[yavaya] transition ${kind} -> ${to} planned ${plannedMs}ms actual ${Math.round(actual)}ms fps ${Math.round(stats.fps)} dropped ${stats.dropped} latency ${latency === null ? '-' : Math.round(latency)}ms`);
}

export const transitionLog = (): readonly TransitionRecord[] => log;
export function subscribeTransitions(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Start-up timing (Chapter 08). */
export const startup = { jsStart: 0, firstFrame: 0, interactive: 0, warmResumes: [] as number[] };
