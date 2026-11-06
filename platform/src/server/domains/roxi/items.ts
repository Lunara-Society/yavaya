import 'server-only';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiItems } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { ROXI_PLANS } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { notify } from '@/server/domains/notifications/service';
import { currentPlan } from './credits';

/**
 * What a member asks Roxi to keep: goals (skill 1), the day's tasks (3),
 * reminders (5), good moments (7) and things to remember about them (5).
 *
 * The member's own words are sealed at rest with ROXI_KEY; only what
 * scheduling needs is in clear. Every item is visible, editable and
 * deletable on /roxi/memory, and Roxi saves one only after asking — the
 * agent is told so, and the panel shows each save as it happens.
 *
 * A reminder's notification never carries its text (notifications are not
 * sealed): it says "you have a reminder" and opens the page.
 */

/*
 * goal (1), reminder (5, and promises: 24), task (3), moment (7), fact (5, 35),
 * watch (price memory, 26), mission (a goal with steps and a budget, 42),
 * capsule (a message to oneself that opens on a date, 32), milestone (Mi camino, 19).
 */
export const ITEM_KINDS = ['goal', 'reminder', 'task', 'moment', 'fact', 'watch', 'mission', 'capsule', 'milestone'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const REPEATS = ['none', 'weekly', 'monthly', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

/** Upper bounds that are about storage, not plans: a day's checklist, a journal, a list of facts. */
const CAPS = { task: 30, moment: 1_000, fact: 100, milestone: 500 } as const;
const MAX_STEPS = 20;
const PURPOSE = 'roxi.items';

export type ItemBody = {
  title: string;
  detail?: string;
  /** A goal's target amount (whatever the member counts in: córdobas, dollars). */
  target?: number;
  /** A goal's progress so far, in the same unit. */
  progress?: number;
  /** What Roxi can do when the reminder comes ("search where to buy dog food"). */
  action?: string;
  /** A mission's steps, in order. */
  steps?: Array<{ text: string; done: boolean }>;
  /** A watch: where to look and for what. */
  district?: 'mercadito' | 'work';
  query?: string;
  /** A watch: the highest price that counts, in `currency` (Mercadito only). */
  maxPrice?: number;
  currency?: string;
  /** A watch: the place code to look under (a town includes its villages), and its name as shown. */
  placeCode?: string;
  placeName?: string;
  /** A milestone: where it came from — the member's own words, never inferred. */
  source?: 'member';
};

/** `sealedUntil`: a time capsule that has not opened yet. Its words are not shown, to Roxi or on the page. */
export type ItemView = ItemBody & { id: string; kind: ItemKind; dueAt: Date | null; repeat: Repeat; day: string | null; done: boolean; createdAt: Date; sealedUntil: Date | null };

function keys(): { current: string | null; previous: string | null } {
  const env = serverEnv();
  return { current: usableKey(env.ROXI_KEY), previous: usableKey(env.ROXI_KEY_PREVIOUS) };
}

/** Whether Roxi can keep anything: without a key nothing personal is stored at all. */
export function itemsAvailable(): boolean {
  return keys().current !== null;
}

function sealBody(body: ItemBody): string {
  const key = keys().current;
  if (!key) throw new DomainError('integration_unconfigured', 'roxi.memory.error.unavailable');
  return seal(key, PURPOSE, JSON.stringify(body));
}

function openBody(sealed: string): ItemBody {
  const { current, previous } = keys();
  try {
    const parsed = JSON.parse(unsealAny([current, previous], PURPOSE, sealed)) as ItemBody;
    return typeof parsed.title === 'string' ? parsed : { title: '' };
  } catch {
    return { title: '' };
  }
}

const clean = (text: unknown, max: number) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12 ? Math.round(value * 100) / 100 : undefined);

export function cleanBody(input: Partial<Record<keyof ItemBody, unknown>>): ItemBody {
  const title = clean(input.title, 160);
  if (!title) throw errors.validation('roxi.memory.error.title');
  const body: ItemBody = { title };
  const detail = clean(input.detail, 600);
  if (detail) body.detail = detail;
  const target = amount(input.target);
  if (target !== undefined) body.target = target;
  const progress = amount(input.progress);
  if (progress !== undefined) body.progress = progress;
  const action = clean(input.action, 200);
  if (action) body.action = action;
  if (Array.isArray(input.steps)) {
    const steps = (input.steps as unknown[])
      .map((step) => (typeof step === 'string' ? { text: clean(step, 160), done: false } : step && typeof step === 'object' ? { text: clean((step as { text?: unknown }).text, 160), done: (step as { done?: unknown }).done === true } : null))
      .filter((step): step is { text: string; done: boolean } => !!step && step.text.length > 0)
      .slice(0, MAX_STEPS);
    if (steps.length > 0) body.steps = steps;
  }
  if (input.district === 'mercadito' || input.district === 'work') body.district = input.district;
  const query = clean(input.query, 80);
  if (query) body.query = query;
  const maxPrice = amount(input.maxPrice);
  if (maxPrice !== undefined && maxPrice > 0) body.maxPrice = maxPrice;
  const currency = clean(input.currency, 3).toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) body.currency = currency;
  const placeCode = clean(input.placeCode, 80);
  if (/^[a-z]{2}(\.[a-z0-9_-]+)*$/.test(placeCode)) body.placeCode = placeCode;
  const placeName = clean(input.placeName, 120);
  if (placeName) body.placeName = placeName;
  if (input.source === 'member') body.source = 'member';
  return body;
}

function toView(row: typeof roxiItems.$inferSelect, now = new Date()): ItemView {
  const sealedUntil = row.kind === 'capsule' && row.doneAt === null && row.dueAt && row.dueAt > now ? row.dueAt : null;
  return {
    ...(sealedUntil ? { title: '' } : openBody(row.bodySealed)),
    sealedUntil,
    id: row.id,
    kind: row.kind as ItemKind,
    dueAt: row.dueAt,
    repeat: (REPEATS as readonly string[]).includes(row.repeat) ? (row.repeat as Repeat) : 'none',
    day: row.day,
    done: row.doneAt !== null,
    createdAt: row.createdAt,
  };
}

export async function listItems(executor: Executor, userId: string, kind?: ItemKind): Promise<ItemView[]> {
  const rows = await executor
    .select()
    .from(roxiItems)
    .where(kind ? and(eq(roxiItems.userId, userId), eq(roxiItems.kind, kind)) : eq(roxiItems.userId, userId))
    .orderBy(asc(roxiItems.doneAt), asc(roxiItems.dueAt), asc(roxiItems.createdAt))
    .limit(1_200);
  return rows.map((row) => toView(row));
}

async function activeCount(executor: Executor, userId: string, kind: ItemKind, day?: string): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(roxiItems)
    .where(and(eq(roxiItems.userId, userId), eq(roxiItems.kind, kind), kind === 'moment' || kind === 'fact' || kind === 'milestone' ? undefined : isNull(roxiItems.doneAt), day ? eq(roxiItems.day, day) : undefined));
  return Number(row?.n ?? 0);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type NewItem = { kind: ItemKind; body: ItemBody; dueAt?: Date | null; repeat?: Repeat; day?: string | null };

/** Saves one item, within what the member's plan allows. */
export async function addItem(executor: Executor, userId: string, item: NewItem): Promise<ItemView> {
  if (!(ITEM_KINDS as readonly string[]).includes(item.kind)) throw errors.validation('roxi.memory.error.kind');
  const plan = ROXI_PLANS[(await currentPlan(executor, userId)).plan];
  const repeat = item.repeat ?? 'none';
  if (item.kind === 'goal' && (await activeCount(executor, userId, 'goal')) >= plan.goals) throw errors.conflict('roxi.memory.error.goals', { limit: plan.goals });
  if (item.kind === 'reminder') {
    if (!item.dueAt || Number.isNaN(item.dueAt.getTime())) throw errors.validation('roxi.memory.error.when');
    if (repeat !== 'none' && !plan.recurringReminders) throw errors.conflict('roxi.memory.error.repeat');
    if ((await activeCount(executor, userId, 'reminder')) >= plan.reminders) throw errors.conflict('roxi.memory.error.reminders', { limit: plan.reminders });
  }
  if (item.kind === 'task') {
    if (!item.day || !DAY.test(item.day)) throw errors.validation('roxi.memory.error.day');
    if ((await activeCount(executor, userId, 'task', item.day)) >= CAPS.task) throw errors.conflict('roxi.memory.error.tasks', { limit: CAPS.task });
  }
  if ((item.kind === 'moment' || item.kind === 'fact' || item.kind === 'milestone') && (await activeCount(executor, userId, item.kind)) >= CAPS[item.kind]) {
    throw errors.conflict(`roxi.memory.error.${item.kind}s`, { limit: CAPS[item.kind] });
  }
  if (item.kind === 'milestone' && (!item.day || !DAY.test(item.day))) throw errors.validation('roxi.memory.error.day');
  if (item.kind === 'watch') {
    if (!item.body.query && !item.body.maxPrice) throw errors.validation('roxi.memory.error.watch');
    if ((await activeCount(executor, userId, 'watch')) >= plan.watches) throw errors.conflict('roxi.memory.error.watches', { limit: plan.watches });
  }
  if (item.kind === 'mission') {
    if (plan.missions === 0) throw errors.conflict('roxi.memory.error.needs_pro');
    if ((await activeCount(executor, userId, 'mission')) >= plan.missions) throw errors.conflict('roxi.memory.error.missions', { limit: plan.missions });
  }
  if (item.kind === 'capsule') {
    if (plan.capsules === 0) throw errors.conflict('roxi.memory.error.needs_pro');
    if (!item.dueAt || Number.isNaN(item.dueAt.getTime()) || item.dueAt.getTime() < Date.now() + 86_400_000) throw errors.validation('roxi.memory.error.capsule_when');
    if ((await activeCount(executor, userId, 'capsule')) >= plan.capsules) throw errors.conflict('roxi.memory.error.capsules', { limit: plan.capsules });
  }
  const [row] = await executor
    .insert(roxiItems)
    .values({
      userId,
      kind: item.kind,
      bodySealed: sealBody(item.body),
      dueAt: item.kind === 'reminder' || item.kind === 'capsule' ? item.dueAt! : null,
      repeat: item.kind === 'reminder' ? repeat : 'none',
      day: item.kind === 'task' || item.kind === 'milestone' ? item.day! : null,
      // A watch starts looking from now: what was already there is not news.
      notifiedAt: item.kind === 'watch' ? new Date() : null,
    })
    .returning();
  return toView(row!);
}

async function owned(executor: Executor, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw errors.notFound('roxi_item');
  const [row] = await executor.select().from(roxiItems).where(and(eq(roxiItems.id, id), eq(roxiItems.userId, userId))).limit(1);
  if (!row) throw errors.notFound('roxi_item');
  return row;
}

export async function updateItem(
  executor: Executor,
  userId: string,
  id: string,
  change: { body?: Partial<Record<keyof ItemBody, unknown>>; done?: boolean; dueAt?: Date | null; step?: { index: number; done: boolean }; snoozeHours?: number },
): Promise<ItemView> {
  const row = await owned(executor, userId, id);
  // A sealed capsule cannot be read or rewritten before it opens; it can only be deleted.
  if (row.kind === 'capsule' && row.doneAt === null && row.dueAt && row.dueAt > new Date() && (change.body || change.step)) throw errors.conflict('roxi.memory.error.capsule_sealed');
  const given = change.body ? Object.fromEntries(Object.entries(change.body).filter(([, value]) => value !== undefined)) : null;
  let body = given && Object.keys(given).length > 0 ? cleanBody({ ...openBody(row.bodySealed), ...given }) : null;
  if (change.step && row.kind === 'mission') {
    const current = body ?? openBody(row.bodySealed);
    const steps = (current.steps ?? []).map((step, index) => (index === change.step!.index ? { ...step, done: change.step!.done } : step));
    body = { ...current, steps };
  }
  // A promise or reminder put off: the same reminder, later (24: every commitment is snoozable).
  if (change.snoozeHours && row.kind === 'reminder') {
    const hours = Math.min(Math.max(Math.round(change.snoozeHours), 1), 24 * 14);
    change = { ...change, dueAt: new Date(Math.max(Date.now(), row.dueAt?.getTime() ?? 0) + hours * 3_600_000), done: false };
  }
  const [next] = await executor
    .update(roxiItems)
    .set({
      ...(body ? { bodySealed: sealBody(body) } : {}),
      ...(change.done === undefined ? {} : { doneAt: change.done ? new Date() : null }),
      ...(change.dueAt && row.kind === 'reminder' ? { dueAt: change.dueAt, notifiedAt: null } : {}),
      ...(change.step && row.kind === 'mission' && body?.steps?.every((step) => step.done) ? { doneAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(roxiItems.id, row.id))
    .returning();
  return toView(next!);
}

export async function deleteItem(executor: Executor, userId: string, id: string): Promise<void> {
  const row = await owned(executor, userId, id);
  await executor.delete(roxiItems).where(eq(roxiItems.id, row.id));
}

/** Forget everything Roxi kept for this member (the button on /roxi/memory). */
export async function deleteAllItems(executor: Executor, userId: string): Promise<number> {
  const removed = await executor.delete(roxiItems).where(eq(roxiItems.userId, userId)).returning({ id: roxiItems.id });
  return removed.length;
}

/** The next time a repeating reminder comes round. */
export function nextDue(due: Date, repeat: Repeat): Date | null {
  if (repeat === 'none') return null;
  const next = new Date(due);
  if (repeat === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  if (repeat === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  if (repeat === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

/**
 * Reminders whose time has come: one notification each, then the next date
 * for a repeating one, or done for a one-off. Idempotent per due time.
 */
export async function deliverDueReminders(executor: Executor, now = new Date()): Promise<{ sent: number }> {
  const due = await executor
    .select()
    .from(roxiItems)
    .where(and(inArray(roxiItems.kind, ['reminder', 'capsule']), isNull(roxiItems.doneAt), lte(roxiItems.dueAt, now)))
    .limit(500);
  let sent = 0;
  for (const row of due) {
    await executor.transaction(async (tx) => {
      sent += await notify(tx, [
        {
          userId: row.userId,
          category: 'roxi',
          type: row.kind === 'capsule' ? 'roxi.capsule' : 'roxi.reminder',
          titleKey: row.kind === 'capsule' ? 'roxi.notify.capsule' : 'roxi.notify.reminder',
          bodyKey: row.kind === 'capsule' ? 'roxi.notify.capsule_body' : 'roxi.notify.reminder_body',
          href: `/roxi/memory#item-${row.id}`,
          dedupeKey: `roxi-reminder:${row.id}:${row.dueAt!.toISOString()}`,
        },
      ]);
      const next = row.kind === 'capsule' ? null : nextDue(row.dueAt!, (REPEATS as readonly string[]).includes(row.repeat) ? (row.repeat as Repeat) : 'none');
      await tx
        .update(roxiItems)
        .set(next ? { dueAt: next, notifiedAt: now, updatedAt: now } : { doneAt: now, notifiedAt: now, updatedAt: now })
        .where(eq(roxiItems.id, row.id));
    });
  }
  return { sent };
}

/**
 * What Roxi is told about the member's own goals, today's tasks, coming
 * reminders and remembered facts, when she asks (the `my_memory` tool) —
 * compact, for a model to read.
 */
export async function memoryForRoxi(executor: Executor, userId: string, today: string): Promise<Record<string, unknown>> {
  const items = await listItems(executor, userId);
  const soon = Date.now() + 14 * 86_400_000;
  return {
    goals: items.filter((item) => item.kind === 'goal' && !item.done).map(({ id, title, detail, target, progress }) => ({ id, title, detail, target, progress })),
    today: items.filter((item) => item.kind === 'task' && item.day === today).map(({ id, title, done }) => ({ id, title, done })),
    reminders: items
      .filter((item) => item.kind === 'reminder' && !item.done && item.dueAt && item.dueAt.getTime() < soon)
      .map(({ id, title, dueAt, repeat, action }) => ({ id, title, due: dueAt!.toISOString(), repeat, action })),
    remembered: items.filter((item) => item.kind === 'fact').map(({ id, title }) => ({ id, title })),
    moments: items.filter((item) => item.kind === 'moment').length,
    missions: items
      .filter((item) => item.kind === 'mission' && !item.done)
      .map(({ id, title, detail, target, steps }) => ({ id, title, detail, budget: target, steps: (steps ?? []).map((step, index) => ({ index, text: step.text, done: step.done })) })),
    watching: items.filter((item) => item.kind === 'watch' && !item.done).map(({ id, district, query, maxPrice, currency, placeName }) => ({ id, district, query, maxPrice, currency, place: placeName })),
    // A capsule's words are not read before it opens — not even by Roxi.
    capsules: items.filter((item) => item.kind === 'capsule').map(({ id, title, sealedUntil, dueAt }) => (sealedUntil ? { id, opens: sealedUntil.toISOString().slice(0, 10) } : { id, opened: dueAt?.toISOString().slice(0, 10), title })),
    milestones_saved: items.filter((item) => item.kind === 'milestone').length,
  };
}
