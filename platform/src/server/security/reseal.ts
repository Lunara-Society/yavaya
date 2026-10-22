import 'server-only';
import { sql } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { serverEnv, type ServerEnv } from '@/config/env';
import { seal, unseal, usableKey } from './sealed-text';

/**
 * Moves sealed text from a retired key to the current one.
 *
 * Rotating TWO_STEP_KEY or SAFE_SPACE_KEY used to lock out every member with
 * two-step and blank every Espacio Violeta message. Now the old value goes in
 * `…_PREVIOUS`, the site keeps opening what it sealed, and this runs in the
 * release step (scripts/release.cjs) to reseal each value under the new key.
 * Once a release reports nothing left under the old key, `…_PREVIOUS` can be
 * removed.
 *
 * Each value is updated only if it is still the one that was read, so a
 * member writing at the same moment is never overwritten. Running it twice
 * changes nothing the second time.
 */

type Target = { table: string; id: string; column: string; purpose: string };

const GROUPS: Array<{ name: string; current: (env: ServerEnv) => string | undefined; previous: (env: ServerEnv) => string | undefined; names: string; targets: Target[] }> = [
  {
    name: 'two-step',
    current: (env) => env.TWO_STEP_KEY,
    previous: (env) => env.TWO_STEP_KEY_PREVIOUS,
    names: 'TWO_STEP_KEY',
    targets: [{ table: 'two_step_factors', id: 'user_id', column: 'secret_sealed', purpose: 'two-step.secret' }],
  },
  {
    name: 'safe-space',
    current: (env) => env.SAFE_SPACE_KEY,
    previous: (env) => env.SAFE_SPACE_KEY_PREVIOUS,
    names: 'SAFE_SPACE_KEY',
    targets: [
      { table: 'safe_space_room_messages', id: 'id', column: 'body_sealed', purpose: 'safe-space.message' },
      { table: 'safe_space_thread_messages', id: 'id', column: 'body_sealed', purpose: 'safe-space.message' },
      { table: 'safe_space_reports', id: 'id', column: 'snapshot_sealed', purpose: 'safe-space.report' },
      { table: 'safe_space_reports', id: 'id', column: 'note_sealed', purpose: 'safe-space.report' },
    ],
  },
];

export type ResealReport = { target: string; resealed: number; alreadyCurrent: number; unreadable: number };

const BATCH = 500;

function opens(secret: string, purpose: string, sealed: string): boolean {
  try {
    unseal(secret, purpose, sealed);
    return true;
  } catch {
    return false;
  }
}

async function resealTarget(database: Database, target: Target, current: string, previous: string): Promise<ResealReport> {
  const report: ResealReport = { target: `${target.table}.${target.column}`, resealed: 0, alreadyCurrent: 0, unreadable: 0 };
  const table = sql.identifier(target.table);
  const id = sql.identifier(target.id);
  const column = sql.identifier(target.column);
  let after = '';
  for (;;) {
    const rows = (await database.execute(sql`
      select ${id}::text as id, ${column} as value from ${table}
      where ${column} is not null and ${id}::text > ${after}
      order by ${id}::text limit ${BATCH}`)) as unknown as Array<{ id: string; value: string }>;
    if (rows.length === 0) break;
    for (const row of rows) {
      if (opens(current, target.purpose, row.value)) {
        report.alreadyCurrent += 1;
        continue;
      }
      let plain: string;
      try {
        plain = unseal(previous, target.purpose, row.value);
      } catch {
        // Neither key opens it: left exactly as it is, and counted.
        report.unreadable += 1;
        continue;
      }
      await database.execute(sql`
        update ${table} set ${column} = ${seal(current, target.purpose, plain)}
        where ${id}::text = ${row.id} and ${column} = ${row.value}`);
      report.resealed += 1;
    }
    after = rows[rows.length - 1]!.id;
  }
  return report;
}

/** Reseals every group whose previous key is set. Returns nothing to do as an empty list. */
export async function resealUnderCurrentKeys(database: Database): Promise<ResealReport[]> {
  const env = serverEnv();
  const reports: ResealReport[] = [];
  for (const group of GROUPS) {
    const previous = usableKey(group.previous(env));
    if (!previous) continue;
    const current = usableKey(group.current(env));
    // A previous key with no usable current key is a half-done rotation:
    // refuse loudly rather than leave the data sealed under nothing.
    if (!current) throw new Error(`${group.names}_PREVIOUS is set but ${group.names} is missing or too short`);
    if (current === previous) continue;
    for (const target of group.targets) reports.push(await resealTarget(database, target, current, previous));
  }
  return reports;
}
