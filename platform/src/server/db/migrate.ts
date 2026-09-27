import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db } from './client';

/**
 * Applies every pending migration in ./drizzle, in filename order.
 * Safe to run repeatedly — drizzle records what it has already applied.
 */
async function main(): Promise<void> {
  await migrate(db(), { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.log('migrations applied');
  await closeDb();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('migration failed:', error);
  await closeDb();
  process.exit(1);
});
