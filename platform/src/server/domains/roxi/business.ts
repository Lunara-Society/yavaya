import 'server-only';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiBusinessEntries } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { DomainError, errors } from '@/server/errors';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';

/**
 * "¿Cómo va mi negocio?" — a pulpería's day, said aloud, kept as plain
 * numbers (ideas 21 and 33).
 *
 * Roxi only records what the member says (after repeating the amount back)
 * and reads totals from here: every figure is computed by the database, in
 * whole cents, per currency, never by the language model. The summary keeps
 * three things apart that are easy to confuse:
 *
 * - **sales** — money that came in;
 * - **gross profit on the sales whose cost is known** — sales minus what
 *   those goods cost, an estimate the member's own figures allow;
 * - **cash difference** — sales minus stock bought minus other expenses:
 *   money in less money out, which is not profit (stock bought today may be
 *   sold next week).
 *
 * Basic bookkeeping is free on every plan (the proposal asks for that).
 */

export const ENTRY_KINDS = ['sale', 'stock', 'expense', 'owed_to_me', 'paid_to_me', 'i_owe', 'i_paid'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
const PURPOSE = 'roxi.business';
const PER_DAY = 300;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function key(): string | null {
  return usableKey(serverEnv().ROXI_KEY);
}

export function businessAvailable(): boolean {
  return key() !== null;
}

function sealNote(note: string): string {
  const current = key();
  if (!current) throw new DomainError('integration_unconfigured', 'roxi.memory.error.unavailable');
  return seal(current, PURPOSE, note);
}

function openNote(sealed: string | null): string {
  if (!sealed) return '';
  try {
    return unsealAny([key(), usableKey(serverEnv().ROXI_KEY_PREVIOUS)], PURPOSE, sealed);
  } catch {
    return '';
  }
}

/** A money amount as the member said it, to whole cents. Refuses anything that is not a positive, sane number. */
export function toMinor(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? parseAmount(value) : Number.NaN;
  if (!Number.isFinite(number) || number <= 0 || number >= 100_000_000) throw errors.validation('roxi.business.error.amount');
  return Math.round(number * 100);
}

/**
 * "1,800", "1.800", "1800.50", "1.800,50": thousands and decimals are written
 * both ways in Central America. A group of exactly three digits after the
 * last separator is thousands; anything else is decimals.
 */
export function parseAmount(text: string): number {
  // A minus sign is never stripped into a positive amount: "-5" is refused.
  if (/-\s*\d/.test(text)) return Number.NaN;
  const raw = text.replace(/[^\d.,]/g, '');
  if (!raw) return Number.NaN;
  const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  if (last === -1) return Number(raw);
  const decimals = raw.slice(last + 1);
  if (decimals.length === 3 && (raw.match(/[.,]/g) ?? []).length >= 1 && !/[.,]\d{1,2}$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  return Number(`${raw.slice(0, last).replace(/[.,]/g, '')}.${decimals}`);
}

export type NewEntry = { kind: EntryKind; amount: unknown; cost?: unknown; currency: string; day: string; note?: string };

export async function recordEntry(executor: Executor, userId: string, entry: NewEntry) {
  if (!(ENTRY_KINDS as readonly string[]).includes(entry.kind)) throw errors.validation('roxi.business.error.kind');
  const currency = entry.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw errors.validation('roxi.business.error.currency');
  if (!DAY.test(entry.day)) throw errors.validation('roxi.business.error.day');
  const amountMinor = toMinor(entry.amount);
  const costMinor = entry.kind === 'sale' && entry.cost !== undefined && entry.cost !== null && entry.cost !== '' ? toMinor(entry.cost) : null;
  const [{ n } = { n: 0 }] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(roxiBusinessEntries)
    .where(and(eq(roxiBusinessEntries.userId, userId), eq(roxiBusinessEntries.occurredOn, entry.day)));
  if (Number(n) >= PER_DAY) throw errors.conflict('roxi.business.error.limit', { limit: PER_DAY });
  const note = entry.note?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '';
  const [row] = await executor
    .insert(roxiBusinessEntries)
    .values({ userId, kind: entry.kind, amountMinor, costMinor, currency, occurredOn: entry.day, noteSealed: note ? sealNote(note) : null })
    .returning();
  return { id: row!.id, kind: row!.kind, amount: amountMinor / 100, cost: costMinor === null ? null : costMinor / 100, currency, day: entry.day };
}

/** A correction: the entry stays in the history, marked void, and stops counting. */
export async function voidEntry(executor: Executor, userId: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw errors.notFound('roxi_business_entry');
  const updated = await executor
    .update(roxiBusinessEntries)
    .set({ voidedAt: new Date() })
    .where(and(eq(roxiBusinessEntries.id, id), eq(roxiBusinessEntries.userId, userId), isNull(roxiBusinessEntries.voidedAt)))
    .returning({ id: roxiBusinessEntries.id });
  if (updated.length === 0) throw errors.notFound('roxi_business_entry');
}

export type Totals = {
  currency: string;
  sales: number;
  salesCount: number;
  /** Sales whose cost the member gave, and what those goods cost. */
  costedSales: number;
  costOfCostedSales: number;
  /** costedSales − costOfCostedSales: an estimate, and only for those sales. */
  grossProfitOnCosted: number;
  stockBought: number;
  expenses: number;
  /** sales − stockBought − expenses: money in less money out, not profit. */
  cashDifference: number;
  /** Still owed to the member, and still owed by them, over all time. */
  owedToMe: number;
  iOwe: number;
};

const cents = (value: unknown) => Number(value ?? 0);

/** Totals for a period, one row per currency. All arithmetic is integer cents in the database. */
export async function businessSummary(executor: Executor, userId: string, params: { from: string; to: string }): Promise<Totals[]> {
  if (!DAY.test(params.from) || !DAY.test(params.to)) throw errors.validation('roxi.business.error.day');
  const sum = (kind: EntryKind, column: typeof roxiBusinessEntries.amountMinor | typeof roxiBusinessEntries.costMinor = roxiBusinessEntries.amountMinor) =>
    sql<string>`coalesce(sum(${column}) filter (where ${roxiBusinessEntries.kind} = ${kind} and ${roxiBusinessEntries.occurredOn} between ${params.from} and ${params.to}), 0)`;
  const rows = await executor
    .select({
      currency: roxiBusinessEntries.currency,
      sales: sum('sale'),
      salesCount: sql<string>`count(*) filter (where ${roxiBusinessEntries.kind} = 'sale' and ${roxiBusinessEntries.occurredOn} between ${params.from} and ${params.to})`,
      costedSales: sql<string>`coalesce(sum(${roxiBusinessEntries.amountMinor}) filter (where ${roxiBusinessEntries.kind} = 'sale' and ${roxiBusinessEntries.costMinor} is not null and ${roxiBusinessEntries.occurredOn} between ${params.from} and ${params.to}), 0)`,
      costOfCostedSales: sum('sale', roxiBusinessEntries.costMinor),
      stockBought: sum('stock'),
      expenses: sum('expense'),
      // Debts run across periods: what is still open, from the start.
      owedToMe: sql<string>`coalesce(sum(case ${roxiBusinessEntries.kind} when 'owed_to_me' then ${roxiBusinessEntries.amountMinor} when 'paid_to_me' then -${roxiBusinessEntries.amountMinor} else 0 end) filter (where ${roxiBusinessEntries.occurredOn} <= ${params.to}), 0)`,
      iOwe: sql<string>`coalesce(sum(case ${roxiBusinessEntries.kind} when 'i_owe' then ${roxiBusinessEntries.amountMinor} when 'i_paid' then -${roxiBusinessEntries.amountMinor} else 0 end) filter (where ${roxiBusinessEntries.occurredOn} <= ${params.to}), 0)`,
    })
    .from(roxiBusinessEntries)
    .where(and(eq(roxiBusinessEntries.userId, userId), isNull(roxiBusinessEntries.voidedAt), lte(roxiBusinessEntries.occurredOn, params.to)))
    .groupBy(roxiBusinessEntries.currency)
    .orderBy(asc(roxiBusinessEntries.currency));
  return rows
    .map((row) => {
      const sales = cents(row.sales);
      const costed = cents(row.costedSales);
      const cost = cents(row.costOfCostedSales);
      const stock = cents(row.stockBought);
      const expenses = cents(row.expenses);
      return {
        currency: row.currency,
        sales: sales / 100,
        salesCount: Number(row.salesCount),
        costedSales: costed / 100,
        costOfCostedSales: cost / 100,
        grossProfitOnCosted: (costed - cost) / 100,
        stockBought: stock / 100,
        expenses: expenses / 100,
        cashDifference: (sales - stock - expenses) / 100,
        owedToMe: Math.max(0, cents(row.owedToMe)) / 100,
        iOwe: Math.max(0, cents(row.iOwe)) / 100,
      };
    })
    .filter((totals) => totals.sales + totals.stockBought + totals.expenses + totals.owedToMe + totals.iOwe > 0);
}

export type EntryView = { id: string; kind: EntryKind; amount: number; cost: number | null; currency: string; day: string; note: string; voided: boolean };

export async function recentEntries(executor: Executor, userId: string, params: { from?: string; limit?: number } = {}): Promise<EntryView[]> {
  const rows = await executor
    .select()
    .from(roxiBusinessEntries)
    .where(and(eq(roxiBusinessEntries.userId, userId), params.from ? gte(roxiBusinessEntries.occurredOn, params.from) : undefined))
    .orderBy(desc(roxiBusinessEntries.occurredOn), desc(roxiBusinessEntries.createdAt))
    .limit(params.limit ?? 50);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as EntryKind,
    amount: row.amountMinor / 100,
    cost: row.costMinor === null ? null : row.costMinor / 100,
    currency: row.currency,
    day: row.occurredOn,
    note: openNote(row.noteSealed),
    voided: row.voidedAt !== null,
  }));
}

/** The first day of the week (Monday) and month containing `day`, for "this week" and "this month". */
export function periodOf(day: string, period: 'day' | 'week' | 'month'): { from: string; to: string } {
  if (period === 'day') return { from: day, to: day };
  const date = new Date(`${day}T12:00:00Z`);
  if (period === 'month') return { from: `${day.slice(0, 7)}-01`, to: day };
  const back = (date.getUTCDay() + 6) % 7;
  return { from: new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10), to: day };
}
