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

export function getSql(): ReturnType<typeof postgres> {
  if (sql) return sql;
  const env = serverEnv();
  sql = postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    // Fail fast rather than queue behind an exhausted pool during an incident.
    connect_timeout: 10,
    idle_timeout: 30,
    prepare: true,
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
