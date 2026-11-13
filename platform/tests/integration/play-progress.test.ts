import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db/client';
import { register } from '@/server/domains/identity/service';
import { board, buyItem, checkRun, keepRun, ownedItems, playProgressOf, shareRun, sharedRun, unownedParts, dayIsOpen } from '@/server/domains/play/progress';
import { byCourse, countSignal, signalKey, sumSignals } from '@/server/domains/play/signals';
import { DEFAULT_LOOK } from '@/config/play-looks';
import { PLAY_RULES } from '@/config/business-rules';
import { levelOf } from '@/config/play-levels';
import { TRIALS } from '@/ui/play/trials/data';
import { dailyCourse } from '@/ui/play/trials/courses';
import { encodeRun } from '@/ui/play/trials/run';
import { ROUTES, fly } from '../helpers/play-routes';
import { courseRoute } from '../helpers/course-routes';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'play-test', deviceFingerprint: null, userAgent: 'vitest' };

beforeEach(resetTransactionalData);
afterAll(closeDb);

async function player(name = 'Jugadora') {
  const { userId } = await register(
    db(),
    { email: `play-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  return userId;
}

const bronce = TRIALS[0]!;
const bronceRun = () => {
  const run = fly(bronce, ROUTES.bronce);
  return { input: encodeRun(run.samples), seconds: run.time };
};

async function submit(userId: string, course: string, input: string, now = new Date()) {
  const checked = checkRun(course, input, false, now);
  if (!checked.ok) return checked;
  return db().transaction((tx) => keepRun(tx, userId, { course, day: checked.day, input, noCheckpoints: false, seconds: checked.replayed.seconds, medal: checked.replayed.medal!, fails: checked.replayed.fails }));
}

describe('Yavaya Play progress', () => {
  it('keeps a run at the time the server sees, and pays for it once', async () => {
    const userId = await player();
    const { input, seconds } = bronceRun();
    const first = await submit(userId, 'bronce', input);
    if (!first.ok) throw new Error(first.refused);
    expect(first.seconds).toBe(seconds);
    expect(first.best).toBe(true);
    expect(first.medal).toBe('obsidiana');
    const medals = PLAY_RULES.medal.bronce.coins + PLAY_RULES.medal.plata.coins + PLAY_RULES.medal.oro.coins + PLAY_RULES.medal.obsidiana.coins;
    expect(first.achievements.sort()).toEqual(['primera_prueba', 'sin_caidas']);
    expect(first.earned.coins).toBe(PLAY_RULES.firstFinish.coins + medals + 2 * PLAY_RULES.achievement.coins);
    expect((await playProgressOf(db(), userId)).coins).toBe(first.earned.coins);

    // The same run again: nothing new to pay, and not a better time.
    const again = await submit(userId, 'bronce', input);
    if (!again.ok) throw new Error(again.refused);
    expect(again.earned).toEqual({ xp: 0, coins: 0 });
    expect(again.best).toBe(false);
    expect(again.previousBest).toBe(seconds);
  });

  it('refuses what it cannot see finish', () => {
    const { input } = bronceRun();
    const now = new Date();
    expect(checkRun('bronce', input.slice(0, -8), false, now)).toMatchObject({ ok: false });
    expect(checkRun('plata', input, false, now)).toEqual({ ok: false, refused: 'not_finished' });
    expect(checkRun('nowhere', input, false, now)).toEqual({ ok: false, refused: 'course' });
    expect(checkRun('bronce', 'AAAA', false, now)).toEqual({ ok: false, refused: 'input' });
    expect(checkRun('dia-2020-01-01', input, false, now)).toEqual({ ok: false, refused: 'day' });
  });

  it('opens a day route on its day, and for a few hours after midnight', () => {
    expect(dayIsOpen('2026-11-20', new Date('2026-11-20T12:00:00Z'))).toBe(true);
    expect(dayIsOpen('2026-11-20', new Date('2026-11-21T01:00:00Z'))).toBe(true);
    expect(dayIsOpen('2026-11-20', new Date('2026-11-21T12:00:00Z'))).toBe(false);
  });

  it('pays the day route once a day', async () => {
    const userId = await player();
    const day = '2026-11-20';
    const course = dailyCourse(day);
    const run = fly(course, courseRoute(course), { limit: 240 });
    const now = new Date(`${day}T15:00:00Z`);
    const first = await submit(userId, course.id, encodeRun(run.samples), now);
    if (!first.ok) throw new Error(first.refused);
    expect(first.earned.xp).toBeGreaterThanOrEqual(PLAY_RULES.dailyFinish.xp);
    expect(first.achievements).toContain('ruta_primera');
    const again = await submit(userId, course.id, encodeRun(run.samples), now);
    if (!again.ok) throw new Error(again.refused);
    expect(again.earned).toEqual({ xp: 0, coins: 0 });
  });

  it('sells looks for coins earned, never twice, and keeps a look only if it is owned', async () => {
    await player('Primera'); // the first account: a founder
    const userId = await player('Segunda');
    expect(await db().transaction((tx) => buyItem(tx, userId, 'hairColor:oro'))).toEqual({ ok: false, reason: 'coins' });
    const kept = await submit(userId, 'bronce', bronceRun().input);
    if (!kept.ok) throw new Error(kept.refused);
    expect(kept.progress.coins).toBeGreaterThanOrEqual(PLAY_RULES.shop['hairColor:oro']!);
    expect(await unownedParts(db(), userId, { ...DEFAULT_LOOK, hairColor: 'oro' })).toEqual(['hairColor:oro']);
    const bought = await db().transaction((tx) => buyItem(tx, userId, 'hairColor:oro'));
    expect(bought).toMatchObject({ ok: true });
    expect((await playProgressOf(db(), userId)).coins).toBe(kept.progress.coins - PLAY_RULES.shop['hairColor:oro']!);
    expect(await unownedParts(db(), userId, { ...DEFAULT_LOOK, hairColor: 'oro' })).toEqual([]);
    expect(await db().transaction((tx) => buyItem(tx, userId, 'hairColor:oro'))).toEqual({ ok: false, reason: 'owned' });
    // Won, not sold.
    expect(await db().transaction((tx) => buyItem(tx, userId, 'accessory:sombrero_guardian'))).toEqual({ ok: false, reason: 'not_sold' });
    // The founders' hat: among the first accounts, worn without buying (FOUNDER_RULES; worked out, never stored).
    expect(await ownedItems(db(), userId)).toContain('accessory:sombrero_fundador');
    expect(await unownedParts(db(), userId, { ...DEFAULT_LOOK, accessory: 'sombrero_fundador' })).toEqual([]);
  });

  it('ranks the fastest verified runs, and hands out only a run its owner shared', async () => {
    const a = await player('Ana');
    const b = await player('Beto');
    const { input } = bronceRun();
    const run = await submit(a, 'bronce', input);
    await submit(b, 'bronce', input);
    if (!run.ok) throw new Error(run.refused);
    const world = await board(db(), 'bronce', 'world', b);
    expect(world.rows.map((r) => r.name)).toEqual(['Ana', 'Beto']);
    expect(world.rows[0]!.runId).toBe('');
    expect(world.mine?.name).toBe('Beto');
    // No declared place: no city board, rather than a wrong one.
    expect((await board(db(), 'bronce', 'city', b)).available).toBe(false);
    expect(await sharedRun(db(), run.runId!)).toBeNull();
    expect(await shareRun(db(), b, run.runId!)).toBe(false);
    expect(await shareRun(db(), a, run.runId!)).toBe(true);
    expect((await sharedRun(db(), run.runId!))?.input).toBe(input);
  });

  it('levels up as XP grows', () => {
    expect(levelOf(0)).toEqual({ level: 1, from: 0, to: PLAY_RULES.levelStep });
    expect(levelOf(PLAY_RULES.levelStep).level).toBe(2);
    expect(levelOf(PLAY_RULES.levelStep * 3).level).toBe(3);
  });

  it('counts what players do without anything about who', async () => {
    expect(signalKey('fail', 'plata', 2)).toBe('fail:plata:2');
    expect(signalKey('start', 'dia-2026-11-20', 0)).toBe('start:dia');
    expect(signalKey('start', 'nowhere', 0)).toBeNull();
    expect(signalKey('drop table', 'plata', 0)).toBeNull();
    expect(signalKey('fail', 'plata', 99)).toBeNull();
    await countSignal(db(), 'start:plata');
    await countSignal(db(), 'start:plata');
    await countSignal(db(), 'fail:plata:1');
    await countSignal(db(), 'finish:plata');
    expect(byCourse(await sumSignals(db(), 7))).toEqual([{ course: 'plata', start: 2, finish: 1, falls: [0, 1] }]);
  });
});
