import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/config/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
/** A live transaction handle. Domain services accept this so callers can compose. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a domain service can run a query on. */
export type Executor = Database | Transaction;

let sql: ReturnType<typeof postgres> | null = null;
let database: Database | null = null;

/**
 * Whether the connection goes through a transaction-mode connection pooler
 * (PgBouncer, Supabase's pooler, pgcat).
 *
 * This matters more than it looks. In transaction mode the pooler hands a
 * different backend connection to each transaction, so server-side prepared
 * statements do not survive: postgres.js would prepare a statement on one
 * backend and then execute it on another, which fails at runtime with
 * "prepared statement does not exist" — often only under load, once more than
 * one backend is in play.
 *
 * Detected from the port and the conventional `pgbouncer=true` flag, and
 * overridable, so a differently-shaped pooler URL can still be handled.
 */
export function usesTransactionPooler(databaseUrl: string, override?: boolean): boolean {
  if (override !== undefined) return override;
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get('pgbouncer') === 'true') return true;
    // 6543 is the conventional transaction-pooler port; 5432 is direct or
    // session mode, both of which keep prepared statements.
    return url.port === '6543';
  } catch {
    return false;
  }
}

export function getSql(): ReturnType<typeof postgres> {
  if (sql) return sql;
  const env = serverEnv();

  const pooled = usesTransactionPooler(env.DATABASE_URL, env.DATABASE_TRANSACTION_POOLER);

  sql = postgres(env.DATABASE_URL, {
    /*
     * On a serverless platform every concurrent invocation is its own process,
     * so a large per-process pool multiplies into far more connections than
     * Postgres will accept. The pool is therefore small by default and sized
     * by configuration, not by assumption.
     */
    max: env.DATABASE_POOL_MAX,
    // Fail fast rather than queue behind an exhausted pool during an incident.
    connect_timeout: 10,
    idle_timeout: 30,
    prepare: !pooled,
    onnotice: () => {},
  });
  return sql;
}

export function db(): Database {
  if (database) return database;
  database = drizzle(getSql(), { schema, casing: 'snake_case' });
  return database;
}

/** Closes the pool. Used by scripts and tests; never in request handling. */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    database = null;
  }
}
