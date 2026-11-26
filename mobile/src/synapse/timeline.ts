/**
 * When Roxi forms, holds and leaves, from what the page is actually doing.
 *
 * The reconstruction is the app's loading screen, so its progress is the
 * page's: she is never shown complete before the page has loaded, and a slow
 * network leaves her visibly unfinished rather than pretending. Nothing waits
 * on a timer for effect (master directive, "mandatory cinematic delays"): a
 * fast load gets the shortest formation that still reads as one, a tap skips
 * straight to the page, and a page that never finishes is shown anyway.
 *
 * Pure and deterministic, so it runs as a worklet on the UI thread every
 * frame and in node's test runner unchanged.
 */
export type Phase = 'forming' | 'holding' | 'leaving' | 'done';

export type Timeline = {
  phase: Phase;
  /** 0 .. 1, what the shader draws as formed. */
  shown: number;
  /** 0 .. 1, how far she has come apart while leaving. */
  dissolve: number;
  /** Milliseconds since the phase began. */
  inPhase: number;
  /** Milliseconds since she started forming. */
  total: number;
  /** The last frame's length in milliseconds. */
  lastStep: number;
};

export type Inputs = {
  /** The page's load progress, 0 .. 1, as the WebView reports it. */
  target: number;
  loaded: boolean;
  failed: boolean;
  skip: boolean;
  reducedMotion: boolean;
};

/** The quickest she can form, so a fast page still shows a formation and not a flash. */
export const MIN_FORM_MS = 900;
/** A beat to see her whole before she goes. */
export const HOLD_MS = 350;
export const LEAVE_MS = 700;
/** With reduced motion she fades in and out instead, this fast. */
export const FADE_MS = 220;
/** A page that has not loaded by now is shown as it is; it has its own loading states. */
export const MAX_WAIT_MS = 12000;
/** Until the page has loaded she stays this far from complete. */
const UNFINISHED = 0.97;

export const START: Timeline = { phase: 'forming', shown: 0, dissolve: 0, inPhase: 0, total: 0, lastStep: 0 };

function enter(phase: Phase, from: Timeline): Timeline {
  'worklet';
  return { ...from, phase, inPhase: 0 };
}

/** The longest frame step counted: a stalled frame must not jump her ahead. */
const MAX_STEP_MS = 100;

type PhaseStep = (s: Timeline, input: Inputs) => Timeline;

const PHASES: Record<Phase, PhaseStep> = {
  forming: (s, input) => {
    'worklet';
    if (input.skip || input.failed || s.total >= MAX_WAIT_MS) return enter('leaving', s);
    const ceiling = input.loaded ? 1 : Math.min(Math.max(input.target, 0), UNFINISHED);
    const rate = input.reducedMotion ? 1 / FADE_MS : 1 / MIN_FORM_MS;
    const shown = Math.max(s.shown, Math.min(ceiling, s.shown + s.lastStep * rate));
    const next = { ...s, shown };
    return next.shown >= 1 ? enter('holding', next) : next;
  },
  holding: (s, input) => {
    'worklet';
    const hold = input.reducedMotion ? 0 : HOLD_MS;
    return input.skip || s.inPhase >= hold ? enter('leaving', s) : s;
  },
  leaving: (s, input) => {
    'worklet';
    const dissolve = Math.min(1, s.inPhase / (input.reducedMotion ? FADE_MS : LEAVE_MS));
    return dissolve >= 1 ? enter('done', { ...s, dissolve: 1 }) : { ...s, dissolve };
  },
  done: (s) => {
    'worklet';
    return s;
  },
};

export function step(state: Timeline, input: Inputs, dtMs: number): Timeline {
  'worklet';
  const dt = Math.max(0, Math.min(dtMs, MAX_STEP_MS));
  const s: Timeline = { ...state, inPhase: state.inPhase + dt, total: state.total + dt, lastStep: dt };
  return PHASES[s.phase](s, input);
}

/** How opaque the dark field behind her is: it lifts as she leaves, showing the page beneath. */
export function backdrop(state: Timeline): number {
  'worklet';
  if (state.phase === 'done') return 0;
  // Smoothstep: slow to lift, quick through the middle, slow to finish.
  const SMOOTH_A = 3;
  const SMOOTH_B = 2;
  const d = state.dissolve;
  return 1 - d * d * (SMOOTH_A - SMOOTH_B * d);
}
