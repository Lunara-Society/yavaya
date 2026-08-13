import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share one Postgres database; run files serially so
    // ledger and audit ordering assertions stay deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'local',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://yavaya:yavaya@127.0.0.1:5432/yavaya_test',
      SESSION_SECRET: 'test-session-secret-value-that-is-long-enough-000',
      SIGNAL_PEPPER: 'test-signal-pepper-value-that-is-long-enough-0000',
      PRIMARY_ADMIN_EMAIL: 'Junoagattis@gmail.com',
    },
  },
});
