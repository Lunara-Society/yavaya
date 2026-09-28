import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { tickets } from '@/server/db/schema';
import { errors } from '@/server/errors';

/**
 * Tickets shared by every district's moderation.
 *
 * Reports on the same subject collect under one open ticket, so something
 * reported twenty times is one item in a queue with a count of twenty — not
 * twenty items a moderator could resolve inconsistently.
 */

export const OPEN_TICKET_STATUSES = ['open', 'triaged', 'in_review', 'awaiting_reporter'] as const;

export type TicketCategory =
  | 'scam'
  | 'fraud'
  | 'harassment'
  | 'animal_abuse'
  | 'fake_fundraiser'
  | 'fake_listing'
  | 'spam'
  | 'technical_issue'
  | 'other';

function ticketCode(): string {
  return `TCK-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** The open ticket for a subject, opened if there is none. Raises priority, never lowers it. */
export async function openTicketFor(
  tx: Executor,
  params: { subjectType: string; subjectId: string; category: TicketCategory; priority: 'normal' | 'high' },
): Promise<string> {
  const [existing] = await tx
    .select({ id: tickets.id, priority: tickets.priority })
    .from(tickets)
    .where(
      and(
        eq(tickets.subjectType, params.subjectType),
        eq(tickets.subjectId, params.subjectId),
        inArray(tickets.status, [...OPEN_TICKET_STATUSES]),
      ),
    )
    .limit(1)
    .for('update');
  if (existing) {
    if (params.priority === 'high' && existing.priority !== 'high' && existing.priority !== 'urgent') {
      await tx.update(tickets).set({ priority: 'high', updatedAt: new Date() }).where(eq(tickets.id, existing.id));
    }
    return existing.id;
  }

  // A collision on a 24-bit code is rare but possible; retry rather than fail.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [created] = await tx
      .insert(tickets)
      .values({
        code: ticketCode(),
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        category: params.category,
        priority: params.priority,
      })
      .onConflictDoNothing({ target: tickets.code })
      .returning({ id: tickets.id });
    if (created) return created.id;
  }
  throw errors.internal('could not allocate a ticket code');
}
