import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Health check for load balancers and platform probes.
 *
 * Reports `ok` only when the database actually answers — a process that is
 * running but cannot reach Postgres is not healthy, and reporting otherwise
 * would keep a broken instance in rotation.
 *
 * The response carries no version, no hostname, no error detail and no
 * configuration. A health endpoint is unauthenticated by necessity, so it must
 * not become a reconnaissance tool.
 */
export async function GET(): Promise<Response> {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: 'ok' }, { status: 200, headers: NO_STORE });
  } catch {
    return Response.json({ status: 'degraded' }, { status: 503, headers: NO_STORE });
  }
}

const NO_STORE = { 'cache-control': 'no-store' };
