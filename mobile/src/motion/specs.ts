import type { Direction, Route } from '../navigation/routes.ts';

/**
 * Standard motion for every place change (Chapter 06). Pure (tested): the
 * scene host asks which kind of transformation connects two places and how
 * long it takes. Spatial depth decides direction; the kind decides the shape.
 */
export type TransitionKind = 'spatial' | 'return' | 'swipe' | 'focus' | 'summon' | 'dive' | 'lateral' | 'fade';

export const DURATIONS: Record<TransitionKind, number> = {
  spatial: 460,
  return: 320,
  swipe: 220,
  focus: 300,
  summon: 420,
  dive: 480,
  lateral: 240,
  fade: 120,
};

export function transitionFor(from: Route | null, to: Route, direction: Direction, reducedMotion: boolean, fromGesture = false): TransitionKind {
  if (reducedMotion) return 'fade';
  if (direction === 'back') return fromGesture ? 'swipe' : 'return';
  if (to.name === 'roxi') return 'summon';
  if (to.name === 'map') return 'dive';
  if (to.name === 'search' || to.name === 'settings' || to.name === 'lab') return 'focus';
  if (direction === 'lateral') return 'lateral';
  return 'spatial';
}

/** Interaction latency budget (touch to first moving frame) and the dropped-frame budget per transition. */
export const BUDGET = { latencyMs: 100, droppedFrames: 2 } as const;
