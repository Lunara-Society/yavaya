import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { demoContent, notificationPreferences, notifications } from '@/server/db/schema';

/**
 * In-app notifications.
 *
 * Written by the domain service that caused them, inside its transaction:
 * if the action rolls back, so does the news of it. Each one is an i18n key
 * with parameters, so it reads in the member's language whenever they open
 * it. A member who switched a category off gets nothing in it.
 *
 * Never sent about demo content, and never sent to the person who acted.
 */

export const NOTIFICATION_CATEGORIES = ['account', 'community', 'mercadito', 'services', 'work', 'sanctuary', 'animals', 'yavayago', 'moderation'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Categories on unless the member turns them off. */
const DEFAULT_ON: ReadonlySet<string> = new Set(NOTIFICATION_CATEGORIES);

/**
 * What a preference is when the member never touched it. The settings page
 * and the delivery side both ask this, so a switch never shows "off" for
 * something that is in fact being sent. Email is off except the daily
 * summary; marketing stays off until asked for.
 */
export function preferenceDefault(category: string, channel: string): boolean {
  if (channel === 'in_app') return DEFAULT_ON.has(category);
  if (channel === 'email') return category === 'digest';
  return false;
}

export type NotifyInput = {
  userId: string;
  category: NotificationCategory;
  type: string;
  titleKey: string;
  bodyKey?: string | null;
  params?: Record<string, string | number>;
  href?: string | null;
  /** Same key, same news: a repeat is dropped. */
  dedupeKey?: string | null;
  /** The row the news is about. Registered demo content is never news. */
  subjectId?: string | null;
};

async function demoSubjects(executor: Executor, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await executor.select({ id: demoContent.subjectId }).from(demoContent).where(inArray(demoContent.subjectId, ids));
  return new Set(rows.map((row) => row.id));
}

/** Who, among these members, has this category switched off for in-app. */
async function optedOut(executor: Executor, userIds: string[], category: string): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await executor
    .select({ userId: notificationPreferences.userId, enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences.category, category), eq(notificationPreferences.channel, 'in_app')));
  const off = new Set(rows.filter((row) => !row.enabled).map((row) => row.userId));
  if (!DEFAULT_ON.has(category)) {
    const on = new Set(rows.filter((row) => row.enabled).map((row) => row.userId));
    for (const id of userIds) if (!on.has(id)) off.add(id);
  }
  return off;
}

/** Notify one or more members of the same thing. Returns how many were written. */
export async function notify(tx: Executor, inputs: NotifyInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const demo = await demoSubjects(tx, [...new Set(inputs.flatMap((input) => (input.subjectId ? [input.subjectId] : [])))]);
  inputs = inputs.filter((input) => !input.subjectId || !demo.has(input.subjectId));
  let written = 0;
  const byCategory = new Map<string, NotifyInput[]>();
  for (const input of inputs) byCategory.set(input.category, [...(byCategory.get(input.category) ?? []), input]);
  for (const [category, group] of byCategory) {
    const off = await optedOut(tx, [...new Set(group.map((input) => input.userId))], category);
    const rows = group
      .filter((input) => !off.has(input.userId))
      .map((input) => ({
        userId: input.userId,
        category,
        type: input.type,
        titleKey: input.titleKey,
        bodyKey: input.bodyKey ?? null,
        params: input.params ?? {},
        href: input.href ?? null,
        dedupeKey: input.dedupeKey ?? null,
      }));
    if (rows.length === 0) continue;
    const inserted = await tx.insert(notifications).values(rows).onConflictDoNothing().returning({ id: notifications.id });
    written += inserted.length;
  }
  return written;
}

export type NotificationView = {
  id: string;
  category: string;
  titleKey: string;
  bodyKey: string | null;
  params: Record<string, string | number>;
  href: string | null;
  read: boolean;
  createdAt: Date;
};

export async function listNotifications(executor: Executor, userId: string, limit = 50): Promise<NotificationView[]> {
  const rows = await executor
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    titleKey: row.titleKey,
    bodyKey: row.bodyKey,
    params: row.params,
    href: row.href,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }));
}

export async function unreadCount(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markAllRead(executor: Executor, userId: string): Promise<void> {
  await executor.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/** Marks one read and returns where it points — only for its own owner. */
export async function openNotification(executor: Executor, params: { userId: string; id: string }): Promise<string | null> {
  const [row] = await executor
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, params.id), eq(notifications.userId, params.userId)))
    .returning({ href: notifications.href });
  return row?.href ?? null;
}

/** A day stamp for dedupe keys ("one of these per day"). */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
