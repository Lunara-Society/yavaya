import 'server-only';
import { and, asc, count, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import type { Executor, Transaction } from '@/server/db/client';
import { locations, playAchievements, playItems, playProgress, playRewards, playRuns, userProfiles, users, vaultOwned, vaultProducts } from '@/server/db/schema';
import { FOUNDER_RULES, PLAY_RULES } from '@/config/business-rules';
import { ACHIEVEMENTS, PROEZAS, earnedItems, lockedParts, unlockOf, type AchievementId, type Look, type LookPart } from '@/config/play-looks';
import { levelOf } from '@/config/play-levels';
import { MEDALS, TRIALS, type Medal } from '@/ui/play/trials/data';
import { DISTRICT_COURSES, courseById, dayOf } from '@/ui/play/trials/courses';
import { DT, decodeRun, replayRun } from '@/ui/play/trials/run';

/**
 * Yavaya Play's progress on the account (docs/PLAY.md, "Progress").
 *
 * The phone sends what the thumbs did; this plays it again on the same
 * course with the same simulation and keeps only what it saw finish. XP,
 * Play Coins, medals, achievements and the leaderboards come from those
 * replays and nothing else. Every reward is a row in play_rewards, unique by
 * (player, reason, ref), so it is paid once however often it is earned;
 * the totals in play_progress change only in the same transaction.
 */

export type RunRefusal = 'course' | 'day' | 'input' | 'too_long' | 'not_finished';

export type RunOutcome = {
  ok: true;
  runId: string | null;
  seconds: number;
  medal: Medal;
  fails: number;
  /** The player's best time on this course before this run, if any. */
  previousBest: number | null;
  best: boolean;
  earned: { xp: number; coins: number };
  achievements: AchievementId[];
  items: string[];
  progress: PlayProgress;
};

export type PlayProgress = { xp: number; coins: number; gems: number; level: number; levelFrom: number; levelTo: number };

const TRIAL_IDS = TRIALS.map((t) => t.id);

/** Is a day's route still open for runs at `now`? Its own day, and a few hours after midnight UTC. */
export function dayIsOpen(day: string, now: Date): boolean {
  return dayOf(now) === day || dayOf(new Date(now.getTime() - PLAY_RULES.dailyGraceHours * 3_600_000)) === day;
}

/** Checks a run without keeping anything: what the server would see. */
export function checkRun(courseId: string, input: string, noCheckpoints: boolean, now: Date) {
  const course = courseById(courseId);
  if (!course) return { ok: false as const, refused: 'course' as const };
  const day = /^dia-(.+)$/.exec(courseId)?.[1];
  if (day && !dayIsOpen(day, now)) return { ok: false as const, refused: 'day' as const };
  const samples = decodeRun(input);
  if (!samples) return { ok: false as const, refused: 'input' as const };
  if (samples.length * DT > PLAY_RULES.maxRunSeconds) return { ok: false as const, refused: 'too_long' as const };
  const replayed = replayRun(course, samples, noCheckpoints);
  if (!replayed.finished || !replayed.medal) return { ok: false as const, refused: 'not_finished' as const };
  return { ok: true as const, course, day, replayed: { ...replayed, medal: replayed.medal } };
}

function progressOf(row: { xp: number; coins: number; gems?: number } | undefined): PlayProgress {
  const xp = row?.xp ?? 0;
  const level = levelOf(xp);
  return { xp, coins: row?.coins ?? 0, gems: row?.gems ?? 0, level: level.level, levelFrom: level.from, levelTo: level.to };
}

export async function playProgressOf(executor: Executor, userId: string): Promise<PlayProgress> {
  const [row] = await executor.select({ xp: playProgress.xp, coins: playProgress.coins, gems: playProgress.gems }).from(playProgress).where(eq(playProgress.userId, userId)).limit(1);
  return progressOf(row);
}

/** The totals row, locked for this transaction (made if missing). */
export async function lockProgress(tx: Transaction, userId: string) {
  await tx.insert(playProgress).values({ userId }).onConflictDoNothing();
  const [row] = await tx.select({ xp: playProgress.xp, coins: playProgress.coins, gems: playProgress.gems }).from(playProgress).where(eq(playProgress.userId, userId)).for('update');
  return row!;
}

/** Pays a reward once. Returns what was paid (nothing if it had been). */
async function reward(tx: Transaction, userId: string, reason: string, ref: string, xp: number, coins: number) {
  const [row] = await tx.insert(playRewards).values({ userId, reason, ref, xp, coins }).onConflictDoNothing().returning({ xp: playRewards.xp, coins: playRewards.coins });
  return row ?? { xp: 0, coins: 0 };
}

/** Which achievements the player's rewards now prove (the rewards are the evidence: each was paid for a verified run). */
async function provenAchievements(tx: Transaction, userId: string, run: { fails: number; course: string; seconds: number; noCheckpoints: boolean }): Promise<AchievementId[]> {
  const rows = await tx.select({ reason: playRewards.reason, ref: playRewards.ref }).from(playRewards).where(and(eq(playRewards.userId, userId), inArray(playRewards.reason, ['finish', 'medal', 'daily'])));
  const finished = new Set(rows.filter((r) => r.reason === 'finish').map((r) => r.ref));
  const medals = new Set(rows.filter((r) => r.reason === 'medal').map((r) => r.ref));
  const days = rows.filter((r) => r.reason === 'daily').length;
  const proven: AchievementId[] = [];
  if (TRIAL_IDS.some((id) => finished.has(id))) proven.push('primera_prueba');
  if (TRIAL_IDS.every((id) => finished.has(id))) proven.push('cinco_pruebas');
  if (run.fails === 0) proven.push('sin_caidas');
  if (TRIAL_IDS.every((id) => medals.has(`${id}:obsidiana`))) proven.push('obsidiana_todas');
  if ([...medals].some((ref) => ref.endsWith(':guardian'))) proven.push('guardian');
  if (days >= 1) proven.push('ruta_primera');
  if (days >= 7) proven.push('ruta_7');
  if (DISTRICT_COURSES.every((c) => finished.has(c.id))) proven.push('distritos');
  // A proeza: this course with no fall, no checkpoint, at or under its reference (the test route's own time).
  const course = courseById(run.course);
  if (course && run.noCheckpoints && run.fails === 0 && run.seconds <= course.reference) {
    const feat = PROEZAS[course.kind === 'daily' ? 'ruta' : course.id];
    if (feat) proven.push(feat);
  }
  // All five trials' proezas: the master's.
  const held = new Set((await tx.select({ id: playAchievements.achievement }).from(playAchievements).where(eq(playAchievements.userId, userId))).map((r) => r.id));
  for (const id of proven) held.add(id);
  if (TRIAL_IDS.every((id) => held.has(PROEZAS[id]!))) proven.push('proeza_total');
  return proven;
}

/**
 * Keeps a verified run and pays what it earned. The caller has checked it
 * (`checkRun`); this is the bookkeeping, in one transaction.
 */
export async function keepRun(
  tx: Transaction,
  userId: string,
  run: { course: string; day?: string; input: string; noCheckpoints: boolean; seconds: number; medal: Medal; fails: number },
): Promise<RunOutcome> {
  const before = await lockProgress(tx, userId);
  let xp = 0;
  let coins = 0;
  const pay = async (reason: string, ref: string, amount: { xp: number; coins: number }) => {
    const paid = await reward(tx, userId, reason, ref, amount.xp, amount.coins);
    xp += paid.xp;
    coins += paid.coins;
  };

  // The best run on this course: kept; the one it beats is let go (unless it was shared as a challenge).
  const [previous] = await tx.select({ id: playRuns.id, seconds: playRuns.seconds, shared: playRuns.shared }).from(playRuns).where(and(eq(playRuns.userId, userId), eq(playRuns.course, run.course), eq(playRuns.best, true))).limit(1);
  const isBest = !previous || run.seconds < previous.seconds;
  let runId: string | null = null;
  if (isBest) {
    if (previous) {
      if (previous.shared) await tx.update(playRuns).set({ best: false }).where(eq(playRuns.id, previous.id));
      else await tx.delete(playRuns).where(eq(playRuns.id, previous.id));
    }
    const [kept] = await tx.insert(playRuns).values({ userId, course: run.course, seconds: run.seconds, medal: run.medal, noCheckpoints: run.noCheckpoints, fails: run.fails, input: run.input, best: true }).returning({ id: playRuns.id });
    runId = kept!.id;
  }

  // Rewards: the first finish (or the day's route, once a day), and each medal reached for the first time.
  if (run.day) await pay('daily', run.day, PLAY_RULES.dailyFinish);
  else await pay('finish', run.course, PLAY_RULES.firstFinish);
  for (const medal of MEDALS.slice(1, MEDALS.indexOf(run.medal) + 1)) await pay('medal', `${run.course}:${medal}`, PLAY_RULES.medal[medal]);

  // Achievements, and what they unlock.
  const fresh: AchievementId[] = [];
  const items: string[] = [];
  for (const id of await provenAchievements(tx, userId, run)) {
    const [row] = await tx.insert(playAchievements).values({ userId, achievement: id }).onConflictDoNothing().returning({ id: playAchievements.achievement });
    if (!row) continue;
    fresh.push(id);
    await pay('achievement', id, PLAY_RULES.achievement);
    for (const unlock of earnedItems().filter((e) => e.unlock === id)) {
      const [got] = await tx.insert(playItems).values({ userId, item: unlock.item, source: 'achievement' }).onConflictDoNothing().returning({ item: playItems.item });
      if (got) items.push(got.item);
    }
  }

  const totals = { xp: before.xp + xp, coins: before.coins + coins };
  await tx.update(playProgress).set({ ...totals, updatedAt: new Date() }).where(eq(playProgress.userId, userId));
  const after = { ...totals, gems: before.gems };
  return { ok: true, runId, seconds: run.seconds, medal: run.medal, fails: run.fails, previousBest: previous?.seconds ?? null, best: isBest, earned: { xp, coins }, achievements: fresh, items, progress: progressOf(after) };
}

// --- What a player owns ------------------------------------------------------------------------

/** One of the first accounts ever opened (FOUNDER_RULES): worked out from the order of registration, never stored. */
export async function isFounder(executor: Executor, userId: string): Promise<boolean> {
  const [me] = await executor.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!me) return false;
  const [earlier] = await executor.select({ n: count() }).from(users).where(lt(users.createdAt, me.createdAt));
  return (earlier?.n ?? 0) + 1 <= FOUNDER_RULES.firstMembers;
}

/** Every earned option the player may wear, as `part:id`. */
export async function ownedItems(executor: Executor, userId: string): Promise<string[]> {
  const rows = await executor.select({ item: playItems.item }).from(playItems).where(eq(playItems.userId, userId));
  const owned = new Set(rows.map((r) => r.item));
  if (await isFounder(executor, userId)) for (const e of earnedItems().filter((e) => e.unlock === 'founder')) owned.add(e.item);
  // Looks from the Vault: owned by owning the product, while that product is wearable.
  const vault = await executor.select({ item: vaultProducts.lookItem, status: vaultProducts.status }).from(vaultOwned).innerJoin(vaultProducts, eq(vaultProducts.key, vaultOwned.productKey)).where(eq(vaultOwned.userId, userId));
  for (const v of vault) if (v.item && v.status === 'available') owned.add(v.item);
  return [...owned];
}

/** The parts of a look the player does not own; empty when they may wear it. */
export async function unownedParts(executor: Executor, userId: string, look: Look): Promise<string[]> {
  const locked = lockedParts(look);
  if (!locked.length) return [];
  const owned = new Set(await ownedItems(executor, userId));
  return locked.filter((item) => !owned.has(item));
}

export type BuyRefusal = 'not_sold' | 'owned' | 'coins' | 'gems';

/** Buys a look option with Play Coins. */
export async function buyItem(tx: Transaction, userId: string, item: string): Promise<{ ok: true; progress: PlayProgress } | { ok: false; reason: BuyRefusal }> {
  const [part, id] = item.split(':') as [LookPart, string];
  const unlock = unlockOf(part, id);
  // Two currencies, never mixed: Play Coins (earned) for the shop's looks, gems (bought) for the exclusive ones.
  const currency = unlock === 'shop' ? 'coins' : unlock === 'gems' ? 'gems' : null;
  const price = currency === 'coins' ? PLAY_RULES.shop[item] : currency === 'gems' ? PLAY_RULES.gems[item] : undefined;
  if (!currency || !price) return { ok: false, reason: 'not_sold' };
  const totals = await lockProgress(tx, userId);
  const [have] = await tx.select({ item: playItems.item }).from(playItems).where(and(eq(playItems.userId, userId), eq(playItems.item, item))).limit(1);
  if (have) return { ok: false, reason: 'owned' };
  if (totals[currency] < price) return { ok: false, reason: currency };
  if (currency === 'coins') await reward(tx, userId, 'shop', item, 0, -price);
  else await tx.insert(playRewards).values({ userId, reason: 'gem_shop', ref: item, gems: -price });
  await tx.insert(playItems).values({ userId, item, source: currency === 'coins' ? 'shop' : 'gems' });
  const after = { ...totals, [currency]: totals[currency] - price };
  await tx.update(playProgress).set({ [currency]: after[currency], updatedAt: new Date() }).where(eq(playProgress.userId, userId));
  return { ok: true, progress: progressOf(after) };
}

/**
 * A gem pack paid for (the payments fulfiller, server to server, inside the
 * transaction that marks the payment succeeded). Keyed by the payment's
 * reference, so the same payment can never be credited twice.
 */
export async function creditGems(tx: Transaction, userId: string, gems: number, reference: string): Promise<boolean> {
  const totals = await lockProgress(tx, userId);
  const [row] = await tx.insert(playRewards).values({ userId, reason: 'gems', ref: reference, gems }).onConflictDoNothing().returning({ gems: playRewards.gems });
  if (!row) return false;
  await tx.update(playProgress).set({ gems: totals.gems + gems, updatedAt: new Date() }).where(eq(playProgress.userId, userId));
  return true;
}

export async function achievementsOf(executor: Executor, userId: string): Promise<AchievementId[]> {
  const rows = await executor.select({ id: playAchievements.achievement }).from(playAchievements).where(eq(playAchievements.userId, userId));
  return rows.map((r) => r.id as AchievementId).filter((id) => (ACHIEVEMENTS as readonly string[]).includes(id));
}

/** The player's verified best on each course they have finished. */
export async function bestsOf(executor: Executor, userId: string): Promise<Record<string, { seconds: number; medal: string; runId: string }>> {
  const rows = await executor.select({ id: playRuns.id, course: playRuns.course, seconds: playRuns.seconds, medal: playRuns.medal }).from(playRuns).where(and(eq(playRuns.userId, userId), eq(playRuns.best, true)));
  return Object.fromEntries(rows.map((r) => [r.course, { seconds: r.seconds, medal: r.medal, runId: r.id }]));
}

// --- Leaderboards -------------------------------------------------------------------------------

export type BoardScope = 'world' | 'country' | 'city';
export type BoardRow = { rank: number; name: string; seconds: number; medal: string; runId: string; me: boolean };

/** The viewer's own country or city (the place their profile declares), as a location code. */
async function scopeCode(executor: Executor, userId: string, scope: 'country' | 'city'): Promise<string | null> {
  const [row] = await executor
    .select({ code: locations.code, level: locations.level, path: locations.path })
    .from(userProfiles)
    .innerJoin(locations, eq(locations.id, userProfiles.locationId))
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  const levels = scope === 'country' ? ['country'] : ['city', 'town', 'village'];
  if (levels.includes(row.level)) return row.code;
  const [ancestor] = await executor
    .select({ code: locations.code })
    .from(locations)
    .where(and(inArray(locations.code, row.path.length ? row.path : ['-']), inArray(locations.level, levels as never)))
    .orderBy(sql`${locations.depth} desc`)
    .limit(1);
  return ancestor?.code ?? null;
}

/**
 * The fastest verified runs on a course. A player appears in their city's
 * board only if their profile lets their city be shown (location precision
 * city or finer); in their country's, if they declared one. Accounts that
 * are suspended, banned or closed are left out.
 */
export async function board(executor: Executor, course: string, scope: BoardScope, viewerId: string | null): Promise<{ rows: BoardRow[]; mine: BoardRow | null; place: string | null; available: boolean }> {
  let code: string | null = null;
  if (scope !== 'world') {
    if (!viewerId) return { rows: [], mine: null, place: null, available: false };
    code = await scopeCode(executor, viewerId, scope);
    if (!code) return { rows: [], mine: null, place: null, available: false };
  }
  const where = [eq(playRuns.course, course), eq(playRuns.best, true), notInArray(users.status, ['suspended', 'banned', 'deactivated'])];
  if (code) {
    where.push(sql`(${locations.code} = ${code} or ${code} = any(${locations.path}))`);
    if (scope === 'city') where.push(inArray(userProfiles.locationPrecision, ['city', 'neighborhood', 'exact']));
  }
  const base = executor
    .select({ userId: playRuns.userId, name: users.displayName, seconds: playRuns.seconds, medal: playRuns.medal, runId: playRuns.id })
    .from(playRuns)
    .innerJoin(users, eq(users.id, playRuns.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, playRuns.userId))
    .leftJoin(locations, eq(locations.id, userProfiles.locationId))
    .where(and(...where));
  const top = await base.orderBy(asc(playRuns.seconds), asc(playRuns.createdAt)).limit(PLAY_RULES.boardSize);
  // Another player's run is not handed out from a board: only a run they chose to share is (sharedRun).
  const rows = top.map((r, i) => ({ rank: i + 1, name: r.name, seconds: r.seconds, medal: r.medal, runId: r.userId === viewerId ? r.runId : '', me: r.userId === viewerId }));
  let mine = rows.find((r) => r.me) ?? null;
  if (!mine && viewerId) {
    const [own] = await executor
      .select({ name: users.displayName, seconds: playRuns.seconds, medal: playRuns.medal, runId: playRuns.id })
      .from(playRuns)
      .innerJoin(users, eq(users.id, playRuns.userId))
      .where(and(eq(playRuns.course, course), eq(playRuns.best, true), eq(playRuns.userId, viewerId)))
      .limit(1);
    if (own) {
      const ahead = await executor
        .select({ n: count() })
        .from(playRuns)
        .innerJoin(users, eq(users.id, playRuns.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, playRuns.userId))
        .leftJoin(locations, eq(locations.id, userProfiles.locationId))
        .where(and(...where, lt(playRuns.seconds, own.seconds)));
      mine = { rank: (ahead[0]?.n ?? 0) + 1, name: own.name, seconds: own.seconds, medal: own.medal, runId: own.runId, me: true };
    }
  }
  return { rows, mine, place: code, available: true };
}

/** A run shared as a challenge: what the game needs to race its ghost. Only shared runs are given out. */
export async function sharedRun(executor: Executor, runId: string) {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return null;
  const [row] = await executor
    .select({ id: playRuns.id, course: playRuns.course, seconds: playRuns.seconds, medal: playRuns.medal, noCheckpoints: playRuns.noCheckpoints, input: playRuns.input, name: users.displayName })
    .from(playRuns)
    .innerJoin(users, eq(users.id, playRuns.userId))
    .where(and(eq(playRuns.id, runId), eq(playRuns.shared, true), notInArray(users.status, ['suspended', 'banned', 'deactivated'])))
    .limit(1);
  return row ?? null;
}

/** Shares one of the player's own kept runs as a challenge. */
export async function shareRun(executor: Executor, userId: string, runId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return false;
  const done = await executor.update(playRuns).set({ shared: true }).where(and(eq(playRuns.id, runId), eq(playRuns.userId, userId))).returning({ id: playRuns.id });
  return done.length > 0;
}
