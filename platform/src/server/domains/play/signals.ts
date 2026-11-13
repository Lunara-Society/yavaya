import 'server-only';
import { and, desc, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import type { AuthContext } from '@/server/domains/access/authorize';
import { requirePermission } from '@/server/domains/access/authorize';
import { playStats } from '@/server/db/schema';
import { courseById } from '@/ui/play/trials/courses';

/**
 * What players do, counted (docs/PLAY.md, "What players do"): how many
 * start a course, finish it, and where they fall. Anonymous by design: a key
 * like `fail:plata:2` (fell before the second checkpoint of Plata) and a
 * number per day. Nothing about who, which device or from where, so it can
 * be collected from guests too without asking anything of them.
 */

export const SIGNAL_EVENTS = ['start', 'finish', 'fail'] as const;
export type SignalEvent = (typeof SIGNAL_EVENTS)[number];

/** A key, or null if it is not one we count. Day routes count together as `dia` (one key, not one a day). */
export function signalKey(event: unknown, course: unknown, segment: unknown): string | null {
  if (typeof event !== 'string' || !(SIGNAL_EVENTS as readonly string[]).includes(event)) return null;
  if (typeof course !== 'string') return null;
  const name = course === 'rush' ? 'rush' : courseById(course) ? (course.startsWith('dia-') ? 'dia' : course) : null;
  if (!name) return null;
  if (event !== 'fail') return `${event}:${name}`;
  const n = Number(segment);
  if (!Number.isInteger(n) || n < 0 || n > 12) return null;
  return `fail:${name}:${n}`;
}

export async function countSignal(executor: Executor, key: string, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await executor
    .insert(playStats)
    .values({ day, key, count: 1 })
    .onConflictDoUpdate({ target: [playStats.day, playStats.key], set: { count: sql`${playStats.count} + 1` } });
}

/** The counts of the last `days` days, summed by key: the owner's (Admin → Visitas, roles.manage). */
export async function signalTotals(executor: Executor, actor: AuthContext | null, days: number, now = new Date()) {
  await requirePermission(executor, actor, 'roles.manage');
  return sumSignals(executor, days, now);
}

/** Per course: how many started, finished, and fell before each checkpoint. */
export function byCourse(rows: Array<{ key: string; count: number }>) {
  const out = new Map<string, { start: number; finish: number; falls: number[] }>();
  for (const { key, count } of rows) {
    const [event, course, segment] = key.split(':') as [string, string, string | undefined];
    const entry = out.get(course) ?? { start: 0, finish: 0, falls: [] };
    if (event === 'start') entry.start += count;
    else if (event === 'finish') entry.finish += count;
    else if (event === 'fail') entry.falls[Number(segment)] = (entry.falls[Number(segment)] ?? 0) + count;
    out.set(course, entry);
  }
  return [...out.entries()].map(([course, v]) => ({ course, ...v, falls: Array.from(v.falls, (n) => n ?? 0) })).sort((a, b) => b.start - a.start);
}

export async function sumSignals(executor: Executor, days: number, now = new Date()): Promise<Array<{ key: string; count: number }>> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return executor
    .select({ key: playStats.key, count: sql<number>`sum(${playStats.count})::int` })
    .from(playStats)
    .where(and(gte(playStats.day, since)))
    .groupBy(playStats.key)
    .orderBy(desc(sql`sum(${playStats.count})`));
}
