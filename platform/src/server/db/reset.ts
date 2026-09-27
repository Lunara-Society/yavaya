import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { closeDb, db } from './client';
import { serverEnv } from '@/config/env';

/**
 * Drops and recreates the public schema, then leaves the database empty for
 * `db:migrate` and `db:seed`.
 *
 * Refuses to run against anything but a local database. Losing a production
 * audit log to a mistyped command is not a recoverable mistake.
 */
async function main(): Promise<void> {
  const env = serverEnv();

  if (env.APP_ENV !== 'local' || env.NODE_ENV === 'production') {
    throw new Error(`refusing to reset: APP_ENV=${env.APP_ENV} NODE_ENV=${env.NODE_ENV}`);
  }
  if (!/(localhost|127\.0\.0\.1)/.test(env.DATABASE_URL)) {
    throw new Error('refusing to reset: DATABASE_URL does not point at a local host');
  }

  await db().execute(sql`drop schema public cascade`);
  await db().execute(sql`create schema public`);

  // eslint-disable-next-line no-console
  console.log('schema reset — run db:migrate and db:seed next');
  await closeDb();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('reset failed:', error);
  await closeDb();
  process.exit(1);
});
