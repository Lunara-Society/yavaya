import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Assembles the deployable artifact from a completed build.
 *
 * Next's `standalone` output is not self-contained despite the name: the static
 * assets and anything the server does not trace are left behind. The Dockerfile
 * already knows this and copies the missing pieces in. This script does exactly
 * the same assembly without a container, for hosts that run Node directly from
 * a directory — a Passenger application root, for instance.
 *
 * Output: ./deploy, ready to upload verbatim.
 *
 * Run after `npm run build`.
 */

const OUT = 'deploy';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists('.next/standalone'))) {
  throw new Error('.next/standalone missing — run `npm run build` first');
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// The traced server bundle and its pruned node_modules.
await cp('.next/standalone', OUT, { recursive: true });

// Static assets. Next does not place these in standalone, and without them the
// application serves HTML that references chunks returning 404.
await cp('.next/static', join(OUT, '.next/static'), { recursive: true });

// Optional in Next, and this project has no static assets yet. Created either
// way so the deployed tree is the same shape whether or not it gains any.
await mkdir(join(OUT, 'public'), { recursive: true });
if (await exists('public')) {
  await cp('public', join(OUT, 'public'), { recursive: true });
}

// Migrations, and the release scripts that apply them.
await cp('drizzle', join(OUT, 'drizzle'), { recursive: true });
await cp('dist/scripts', join(OUT, 'dist/scripts'), { recursive: true });

/*
 * Next copies the project's package.json into the standalone output verbatim,
 * so the deployed manifest declares typescript, vitest, tsx, drizzle-kit,
 * esbuild and Tailwind — none of which the artifact contains or needs, because
 * the real dependencies are traced into the server bundle instead.
 *
 * That is harmless until something runs `npm install` against it. cPanel's
 * Node.js panel has a button that does precisely that, and pressing it would
 * install an entire build toolchain into the application root of a
 * memory-limited shared host. Replacing the manifest removes the trap rather
 * than documenting it.
 */
const source = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = {
  name: source.name,
  version: source.version,
  private: true,
  description: source.description,
  engines: source.engines,
  scripts: {
    start: 'node server.js',
    'db:migrate': 'node dist/scripts/migrate.cjs',
    'db:seed': 'node dist/scripts/seed.cjs',
    jobs: 'node dist/scripts/jobs.cjs',
  },
  // Intentionally empty: every runtime dependency is already bundled or
  // vendored into ./node_modules by the build. Declaring them again would
  // invite an install that can only do harm.
  dependencies: {},
};
await writeFile(join(OUT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// eslint-disable-next-line no-console
console.log(`deployable artifact assembled at ./${OUT} — startup file: server.js`);
