/**
 * What Roxi is actually doing, for anything on the page that shows her
 * presence (the First Light's orb today; the rest of the site later).
 *
 * The panel and the root publish the raw facts they already hold — the
 * conversation's phase, whether she is listening or speaking, which tool is
 * running, whether a confirmation card is waiting — and `toVisual` turns them
 * into one of a small set of states. Nothing here invents progress: every
 * state is read from something that is happening, and when nothing is, she is
 * idle.
 *
 * Kept in a module (shared by every chunk that imports it) and announced with
 * a window event, so a component that mounts late can read the current state
 * and then follow it.
 */
export type RoxiActivity = 'searching' | 'preparing' | 'filling' | 'checking' | 'opening' | 'saving';

export type RoxiRaw = {
  /** A signed-in member with an agent configured, on a page where Roxi is offered. */
  available: boolean;
  open: boolean;
  phase: 'idle' | 'connecting' | 'live' | 'paused' | 'ended';
  orb: 'idle' | 'listening' | 'speaking' | 'thinking';
  /** A message was sent and not answered yet. */
  waiting: boolean;
  activity: RoxiActivity | null;
  /** A confirmation card ("Permitir") is open. */
  confirming: boolean;
  /** The microphone failed, or the last message went unanswered. */
  problem: boolean;
  /** When a tool last finished, or a confirmation was allowed (ms since epoch). */
  completedAt: number;
};

export type RoxiVisual =
  | 'unavailable'
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'processing'
  | 'searching'
  | 'responding'
  | 'awaiting'
  | 'completed'
  | 'error';

/** How long the "completed" light stays after a tool finishes. */
export const COMPLETED_MS = 2400;

export const IDLE_RAW: RoxiRaw = {
  available: false,
  open: false,
  phase: 'idle',
  orb: 'idle',
  waiting: false,
  activity: null,
  confirming: false,
  problem: false,
  completedAt: 0,
};

/**
 * The precedence is deliberate: a problem is shown over anything else, and a
 * waiting confirmation over work in progress, because both need the member.
 */
export function toVisual(raw: RoxiRaw, now: number): RoxiVisual {
  if (!raw.available) return 'unavailable';
  if (raw.problem) return 'error';
  if (raw.confirming) return 'awaiting';
  if (raw.activity === 'searching') return 'searching';
  if (raw.activity) return 'processing';
  if (raw.orb === 'speaking') return 'responding';
  if (raw.waiting || raw.phase === 'connecting') return 'understanding';
  if (raw.orb === 'listening') return 'listening';
  if (raw.completedAt && now - raw.completedAt < COMPLETED_MS) return 'completed';
  return 'idle';
}

export const ROXI_STATE_EVENT = 'roxi:state';

let current: RoxiRaw = IDLE_RAW;

export function readRoxiState(): RoxiRaw {
  return current;
}

export function publishRoxiState(patch: Partial<RoxiRaw>): void {
  const next = { ...current, ...patch };
  const changed = (Object.keys(next) as (keyof RoxiRaw)[]).some((key) => next[key] !== current[key]);
  if (!changed) return;
  current = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<RoxiRaw>(ROXI_STATE_EVENT, { detail: next }));
}

export function subscribeRoxiState(listener: (raw: RoxiRaw) => void): () => void {
  const onEvent = (event: Event) => listener((event as CustomEvent<RoxiRaw>).detail);
  window.addEventListener(ROXI_STATE_EVENT, onEvent);
  return () => window.removeEventListener(ROXI_STATE_EVENT, onEvent);
}
