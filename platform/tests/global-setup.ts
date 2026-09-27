import { execFileSync } from 'node:child_process';

/**
 * Brings the test database to a known state once per run: schema migrated,
 * reference data seeded. Individual tests truncate the transactional tables
 * they touch rather than re-running this.
 */
export default async function setup(): Promise<void> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    APP_ENV: 'local',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgres://yavaya:yavaya@127.0.0.1:5432/yavaya_test',
    SESSION_SECRET: 'test-session-secret-value-that-is-long-enough-000',
    SIGNAL_PEPPER: 'test-signal-pepper-value-that-is-long-enough-0000',
    PRIMARY_ADMIN_EMAIL: 'yavayago@gmail.com',
  };

  execFileSync('npx', ['tsx', 'src/server/db/migrate.ts'], { env, stdio: 'inherit' });
  execFileSync('npx', ['tsx', 'src/server/db/seed/index.ts'], { env, stdio: 'inherit' });
}
