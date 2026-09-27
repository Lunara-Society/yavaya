/**
 * The release step: migrate, then seed. Run once per deploy, before new
 * instances take traffic (Railway's pre-deploy command).
 *
 * One entry point, on purpose. The platform used to be configured with
 * `migrate.cjs && seed.cjs`, but Railway runs a pre-deploy command without a
 * shell, so `&& …` became ignored arguments to the migration: the seed never
 * ran, reference data such as the `member` role never existed, and every
 * registration failed while the health check stayed green.
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

for (const step of ['migrate.cjs', 'seed.cjs']) {
  // Inherit stdio so each step's own output reaches the deploy log; a
  // non-zero exit throws, which fails the release and keeps the old version.
  execFileSync(process.execPath, [join(__dirname, step)], { stdio: 'inherit' });
}
console.log('release complete');
