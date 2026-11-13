import { MEDALS, TRIALS, type Medal } from './data';

/**
 * A player's records on this phone (docs/PLAY.md): every course's best time
 * and medal, and the run itself (its input), to race as a ghost. A guest's
 * records live only here, and the screen says so. A signed-in player's
 * verified bests live on the account (server/domains/play/progress.ts);
 * this copy only makes the game quick to open and works offline.
 */
export type TrialRecord = { best: number; medal: Medal; attempts: number };

const KEY = 'yavaya.play.trials';
const GHOST = 'yavaya.play.ghost.';

export function readRecords(): Record<string, TrialRecord> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, TrialRecord>;
    const out: Record<string, TrialRecord> = {};
    for (const [id, r] of Object.entries(raw)) {
      if (r && Number.isFinite(r.best) && r.best > 0 && (MEDALS as readonly string[]).includes(r.medal)) out[id] = { best: r.best, medal: r.medal, attempts: Number(r.attempts) || 1 };
    }
    return out;
  } catch {
    return {};
  }
}

/** Keeps a finished run; true when it is a new best time. Day routes other than today's are let go. */
export function writeRecord(id: string, seconds: number, medal: Medal, today?: string): boolean {
  const all = readRecords();
  for (const key of Object.keys(all)) if (key.startsWith('dia-') && today && key !== `dia-${today}`) delete all[key];
  const before = all[id];
  const better = (a: Medal, b: Medal) => (MEDALS.indexOf(a) > MEDALS.indexOf(b) ? a : b);
  const record = !before || seconds < before.best;
  all[id] = { best: record ? seconds : before!.best, medal: before ? better(medal, before.medal) : medal, attempts: (before?.attempts ?? 0) + 1 };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Kept for this visit only.
  }
  return record;
}

/** The best run's input on this phone, to race as a ghost. */
export function readGhost(id: string): { seconds: number; input: string; noCheckpoints: boolean } | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(GHOST + id) ?? 'null') as { seconds?: unknown; input?: unknown; noCheckpoints?: unknown } | null;
    if (!raw || typeof raw.seconds !== 'number' || typeof raw.input !== 'string') return null;
    return { seconds: raw.seconds, input: raw.input, noCheckpoints: raw.noCheckpoints === true };
  } catch {
    return null;
  }
}

export function writeGhost(id: string, seconds: number, input: string, noCheckpoints: boolean, today?: string) {
  try {
    // Yesterday's routes are gone for good: their ghosts go with them.
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${GHOST}dia-`) && today && key !== `${GHOST}dia-${today}`) window.localStorage.removeItem(key);
    }
    const current = readGhost(id);
    if (!current || seconds < current.seconds) window.localStorage.setItem(GHOST + id, JSON.stringify({ seconds, input, noCheckpoints }));
  } catch {
    // A full or blocked storage: no ghost next time, nothing else lost.
  }
}

/** A trial is open when the one before it has been finished, here or on the account (the first always is). */
export function isOpen(id: string, records: Record<string, unknown> = readRecords()): boolean {
  const index = TRIALS.findIndex((t) => t.id === id);
  return index <= 0 || Boolean(records[TRIALS[index - 1]!.id]);
}
