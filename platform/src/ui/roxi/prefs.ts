import { ROXI_RULES } from '@/config/business-rules';

/**
 * What a member chose about Roxi, kept in this browser only (localStorage):
 * how present she is, how long her answers are, how fast she speaks, quiet
 * hours, and whether this tab keeps the conversation. Nothing here reaches
 * Yavaya's servers; the answer length travels to Roxi when a conversation
 * starts, as a preference she follows, never as an instruction.
 *
 * Every read survives a missing or blocked storage (private windows, an
 * old value from an earlier version): it falls back to the defaults.
 */

export const ROXI_MODES = ['quiet', 'available', 'proactive'] as const;
export type RoxiMode = (typeof ROXI_MODES)[number];
export const ROXI_LENGTHS = ['short', 'normal', 'detailed'] as const;
export type RoxiLength = (typeof ROXI_LENGTHS)[number];
export const ROXI_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type RoxiSpeed = (typeof ROXI_SPEEDS)[number];

export type RoxiPrefs = {
  /** Available by default: a single hello a day at most. The simulated call needs Proactive, which only the member turns on. */
  mode: RoxiMode;
  length: RoxiLength;
  speed: RoxiSpeed;
  quietFrom: number;
  quietTo: number;
  /** Keep this tab's conversation until the tab closes (sessionStorage). */
  keep: boolean;
};

export const DEFAULT_PREFS: RoxiPrefs = {
  mode: 'available',
  length: 'normal',
  speed: 'normal',
  quietFrom: ROXI_RULES.quietHours.from,
  quietTo: ROXI_RULES.quietHours.to,
  keep: true,
};

/** Text-to-speech speed for each choice, inside the range the voice accepts (0.7–1.2). */
export const SPEED_VALUE: Record<RoxiSpeed, number> = { slow: 0.85, normal: 1, fast: 1.15 };

export const PREFS_KEY = 'roxi.prefs.v1';
export const LOG_KEY = 'roxi.log.v1';
export const PRESENCE_KEY = 'roxi.presence.v1';

const hour = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 23 ? (value as number) : fallback);
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Whatever was stored, made safe: unknown values become the defaults. */
export function cleanPrefs(raw: unknown): RoxiPrefs {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    mode: oneOf(ROXI_MODES, value.mode, DEFAULT_PREFS.mode),
    length: oneOf(ROXI_LENGTHS, value.length, DEFAULT_PREFS.length),
    speed: oneOf(ROXI_SPEEDS, value.speed, DEFAULT_PREFS.speed),
    quietFrom: hour(value.quietFrom, DEFAULT_PREFS.quietFrom),
    quietTo: hour(value.quietTo, DEFAULT_PREFS.quietTo),
    keep: typeof value.keep === 'boolean' ? value.keep : DEFAULT_PREFS.keep,
  };
}

export function readPrefs(): RoxiPrefs {
  try {
    return cleanPrefs(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: RoxiPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(cleanPrefs(prefs)));
    window.dispatchEvent(new Event('roxi:prefs'));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** Everything Roxi keeps in this browser, gone. */
export function forgetEverything(): void {
  try {
    window.localStorage.removeItem(PREFS_KEY);
    window.localStorage.removeItem(PRESENCE_KEY);
    window.sessionStorage.removeItem(LOG_KEY);
    window.dispatchEvent(new Event('roxi:prefs'));
    window.dispatchEvent(new Event('roxi:forget'));
  } catch {
    // Nothing could be stored either.
  }
}

/**
 * The member's preferences as Roxi reads them (the `member_preferences`
 * dynamic variable). In English, like her instructions; she answers in the
 * member's language regardless.
 */
export function preferencesForRoxi(prefs: RoxiPrefs): string {
  const length: Record<RoxiLength, string> = {
    short: 'Keep answers very short: one or two sentences.',
    normal: '',
    detailed: 'Give fuller answers with a little more detail and steps when useful, still in plain words.',
  };
  return length[prefs.length];
}
