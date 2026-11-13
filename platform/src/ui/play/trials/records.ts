import { MEDALS, TRIALS, type Medal, type Trial } from './data';

/**
 * A player's trial records, kept on this phone (docs/PLAY.md). The screen
 * says so. Records on the account, checked by the server, come with the
 * progression step; until then nothing here is presented as more than it is.
 */
export type TrialRecord = { best: number; medal: Medal; attempts: number };

const KEY = 'yavaya.play.trials';

export function readRecords(): Partial<Record<Trial['id'], TrialRecord>> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, TrialRecord>;
    const out: Partial<Record<Trial['id'], TrialRecord>> = {};
    for (const t of TRIALS) {
      const r = raw[t.id];
      if (r && Number.isFinite(r.best) && r.best > 0 && (MEDALS as readonly string[]).includes(r.medal)) out[t.id] = { best: r.best, medal: r.medal, attempts: Number(r.attempts) || 1 };
    }
    return out;
  } catch {
    return {};
  }
}

/** Keeps a finished run; true when it is a new best time. */
export function writeRecord(id: Trial['id'], seconds: number, medal: Medal): boolean {
  const all = readRecords();
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

/** A trial is open when the one before it has been finished (the first always is). */
export function isOpen(id: Trial['id'], records = readRecords()): boolean {
  const index = TRIALS.findIndex((t) => t.id === id);
  return index <= 0 || Boolean(records[TRIALS[index - 1]!.id]);
}
