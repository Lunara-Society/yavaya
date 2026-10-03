import 'server-only';
import { sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { listPermissions } from '@/server/domains/access/authorize';
import type { PermissionKey } from '@/server/domains/access/permissions';
import { OPEN_TICKET_STATUSES } from '@/server/domains/moderation/tickets';

/**
 * Everything waiting for a person, in one place.
 *
 * Yavaya promises that a person checks churches, rescuers, employers,
 * licences and reports. A promise like that fails quietly: nothing breaks,
 * someone just waits a week and leaves. This lists every queue with how many
 * are waiting and since when, so the wait is visible.
 */
export type QueueKey =
  | 'sanctuary_churches'
  | 'sanctuary_reports'
  | 'services_licences'
  | 'services_reports'
  | 'animals_rescuers'
  | 'animals_reports'
  | 'work_employers'
  | 'work_reports'
  | 'mercadito_reports'
  | 'community_reports'
  | 'safe_space_reports'
  | 'go_stores'
  | 'go_drivers';

export type QueueStatus = { key: QueueKey; href: string; permission: PermissionKey; count: number; oldestAt: Date | null };

const QUEUES: Array<{ key: QueueKey; href: string; permission: PermissionKey; query: ReturnType<typeof sql> }> = [];
const openTickets = (district: string) => sql`
  select count(distinct t.id)::int as n, min(t.created_at) as oldest
  from tickets t join reports r on r.ticket_id = t.id
  where r.district = ${district} and t.status in (${sql.join(OPEN_TICKET_STATUSES.map((s) => sql`${s}`), sql`, `)})`;
const pending = (table: string, status: string, column = 'status', since = 'updated_at') =>
  sql.raw(`select count(*)::int as n, min(${since}) as oldest from ${table} where ${column} = '${status}'`);

QUEUES.push(
  { key: 'sanctuary_churches', href: '/admin/sanctuary', permission: 'sanctuary.review', query: pending('sanctuary_churches', 'pending') },
  { key: 'sanctuary_reports', href: '/admin/sanctuary', permission: 'sanctuary.review', query: openTickets('sanctuary') },
  { key: 'services_licences', href: '/admin/services', permission: 'services.review', query: pending('services_provider_profiles', 'pending', 'licence_status') },
  { key: 'services_reports', href: '/admin/services', permission: 'services.review', query: openTickets('services') },
  { key: 'animals_rescuers', href: '/admin/animals', permission: 'adoptions.review', query: pending('animals_rescuers', 'pending') },
  { key: 'animals_reports', href: '/admin/animals', permission: 'adoptions.review', query: openTickets('animals') },
  { key: 'work_employers', href: '/admin/work#employers', permission: 'work.review', query: pending('work_employers', 'pending') },
  { key: 'work_reports', href: '/admin/work', permission: 'work.moderate', query: openTickets('works') },
  { key: 'mercadito_reports', href: '/admin/mercadito', permission: 'listings.moderate', query: openTickets('mercadito') },
  { key: 'community_reports', href: '/admin/community', permission: 'moderation.queue.read', query: openTickets('community') },
  { key: 'go_stores', href: '/admin/yavayago#stores', permission: 'stores.review', query: pending('go_stores', 'pending') },
  { key: 'go_drivers', href: '/admin/yavayago#drivers', permission: 'drivers.review', query: pending('go_drivers', 'pending') },
  { key: 'safe_space_reports', href: '/admin/violeta', permission: 'safe_space.review', query: pending('safe_space_reports', 'open', 'status', 'created_at') },
);

async function measure(executor: Executor, q: (typeof QUEUES)[number]): Promise<QueueStatus> {
  const rows = (await executor.execute(q.query)) as unknown as Array<{ n: number; oldest: string | Date | null }>;
  const row = rows[0];
  return { key: q.key, href: q.href, permission: q.permission, count: row?.n ?? 0, oldestAt: row?.oldest ? new Date(row.oldest) : null };
}

/** Every queue this person may work on. */
export async function queuesFor(executor: Executor, userId: string): Promise<QueueStatus[]> {
  const mine = await listPermissions(executor, userId);
  return Promise.all(QUEUES.filter((q) => mine.has(q.permission)).map((q) => measure(executor, q)));
}

/** Every queue, for the operations email. */
export async function allQueues(executor: Executor): Promise<QueueStatus[]> {
  return Promise.all(QUEUES.map((q) => measure(executor, q)));
}

export async function canSeeOps(executor: Executor, userId: string): Promise<boolean> {
  const mine = await listPermissions(executor, userId);
  return QUEUES.some((q) => mine.has(q.permission));
}
