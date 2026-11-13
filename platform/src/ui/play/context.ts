import type { Look } from '@/config/play-looks';
import { sound, soundWanted, type Cue } from '@/ui/first-light/sound';
import type { Controls } from './engine/controls';
import type { Runtime } from './engine/runtime';

/**
 * What every activity is handed (docs/PLAY.md): the screen, the thumbs, the
 * player's words and look, and a way to go somewhere else. Activities never
 * reach for each other; they ask `go`.
 */
export type Place = 'studio' | 'rush' | 'trials';

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
