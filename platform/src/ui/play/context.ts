import type { Look } from '@/config/play-looks';
import { sound, soundWanted, type Cue } from '@/ui/first-light/sound';
import type { Controls } from './engine/controls';
import type { Runtime } from './engine/runtime';

/**
 * What every activity is handed (docs/PLAY.md): the screen, the thumbs, the
 * player's words and look, and a way to go somewhere else. Activities never
 * reach for each other; they ask `go`.
 */
export type Place = 'studio' | 'rush' | 'trials' | 'plaza' | 'shop';

/** A player's progress on the account, as the server last said it (docs/PLAY.md, "Progress"). */
export type Account = {
  progress: { xp: number; coins: number; level: number; levelFrom: number; levelTo: number };
  /** Earned look options the player owns, as `part:id`. */
  owned: string[];
  achievements: string[];
  /** Best verified run per course. */
  bests: Record<string, { seconds: number; medal: string; runId: string }>;
};

/** A shared run to race (from a `?reto=` link). */
export type Challenge = { id: string; course: string; seconds: number; medal: string; noCheckpoints: boolean; input: string; name: string };

/** What the server said about a finished run. */
export type RunVerdict =
  | { ok: true; runId: string | null; seconds: number; medal: string; best: boolean; earned: { xp: number; coins: number }; achievements: string[]; items: string[]; progress: Account['progress'] }
  | { ok: false; reason: 'offline' | 'refused' | 'signed_out' };

export type PlayContext = {
  runtime: Runtime;
  controls: Controls;
  text(key: string, params?: Record<string, string | number>): string;
  look(): Look;
  /** Keeps a new look: on the account when signed in, on this phone otherwise. Resolves false if it could not be kept. */
  saveLook(look: Look): Promise<boolean>;
  signedIn: boolean;
  go(place: Place): void;
  /** Starts a Prueba de Maestría (only offered when the trials are open to this player). */
  startTrial(id: string, noCheckpoints: boolean): void;
  /** Starts any course (a trial, the day's route, a district's), with a ghost to race if one is given. */
  startCourse(id: string, options?: { noCheckpoints?: boolean; challenge?: Challenge | null }): void;
  /** The signed-in player's progress, or null for a guest. */
  account: Account | null;
  /** Sends a finished run to be played again and kept. */
  submitRun(course: string, input: string, noCheckpoints: boolean): Promise<RunVerdict>;
  /** An anonymous count: a course started, finished, or a fall and where. */
  signal(event: 'start' | 'finish' | 'fail', course: string, segment?: number): void;
  /** Today, as the server's clock had it when the page was made (`YYYY-MM-DD`, UTC). */
  today: string;
  /** A challenge the page was opened with, until it is taken. */
  challenge: Challenge | null;
  /** Where to sign in and come back here. */
  signInHref: string;
  /** Whether the Pruebas de Maestría are open to this player (the owner's switch). */
  trials: boolean;
  cue(name: Cue): void;
};

/** The `play.*` texts, as the page hands them over, read with `{placeholders}`. */
export function textReader(texts: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    let value = texts[key] ?? key;
    if (params) for (const [name, given] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(given));
    return value;
  };
}

export function cue(name: Cue) {
  if (soundWanted()) sound().play(name, { force: true });
}

/** A small element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap = 'div'>(className: string, text = '', tag?: K): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag ?? 'div') as HTMLElementTagNameMap[K];
  node.className = className;
  if (text) node.textContent = text;
  if (node instanceof HTMLButtonElement) node.type = 'button';
  return node;
}
