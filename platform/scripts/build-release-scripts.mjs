import { build } from 'esbuild';

/**
 * Bundles the migration and seed entry points into self-contained CommonJS
 * files.
 *
 * The production image carries only Next's standalone output — no TypeScript,
 * no `tsx`, no dev dependencies. A release command that shelled out to `tsx`
 * would work locally and fail on the first real deploy, which is exactly the
 * kind of "works on my machine" gap this bundling removes.
 *
 * Path aliases (`@/…`) resolve through tsconfig, which esbuild reads natively.
 */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  tsconfig: 'tsconfig.json',
  // Keep the bundle honest about its own name in stack traces.
  sourcemap: false,
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: ['src/server/db/migrate.ts'],
  outfile: 'dist/scripts/migrate.cjs',
});

await build({
  ...shared,
  entryPoints: ['src/server/db/seed/index.ts'],
  outfile: 'dist/scripts/seed.cjs',
});

/*
 * Scheduled maintenance. Bundled for the same reason as the two above: the
 * host's scheduler runs a bare shell with no TypeScript and no dev
 * dependencies, so a cron line invoking `tsx` would work locally and fail
 * everywhere that matters.
 */
await build({
  ...shared,
  entryPoints: ['src/server/jobs/run.ts'],
  outfile: 'dist/scripts/jobs.cjs',
});

// eslint-disable-next-line no-console
console.log('release scripts bundled to dist/scripts');
