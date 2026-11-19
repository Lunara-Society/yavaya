/**
 * Where Genesis's source data comes from, pinned, and fetching it.
 *
 * The CC0 data is not kept in the repository (about 400 MB). It is fetched at
 * a pinned commit and a pinned archive checksum into GENESIS_SOURCE
 * (default `.genesis-source/`, ignored by git), so every bake starts from
 * exactly the same files, and a changed upstream file is refused rather than
 * silently baked.
 *
 * usage: npx tsx scripts/genesis/source.ts   (fetches, then verifies)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SOURCE = {
  /** MakeHuman's repository: the base mesh, targets, skeleton and weights (CC0 since September 2020). */
  repo: 'https://github.com/makehumancommunity/makehuman',
  commit: 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482',
  paths: ['makehuman/data/3dobjs', 'makehuman/data/rigs', 'makehuman/data/targets', 'LICENSE.md', 'LICENSE.ASSETS.md'],
  /** MakeHuman's system asset pack: hair, eyes, brows, lashes, teeth, tongue, skins, clothes (all CC0). */
  assets: 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip',
  assetsSha256: 'b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107',
} as const;

export function sourceDir(): string {
  return resolve(process.env.GENESIS_SOURCE ?? join(process.cwd(), '.genesis-source'));
}

export function dataDir(): string {
  return join(sourceDir(), 'mh', 'makehuman', 'data');
}

export function assetsDir(): string {
  return join(sourceDir(), 'sysassets');
}

/** Refuses to bake from anything but the pinned sources. */
export function verifySource(): void {
  const dir = sourceDir();
  const head = execFileSync('git', ['-C', join(dir, 'mh'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== SOURCE.commit) throw new Error(`MakeHuman data is at ${head}, not the pinned ${SOURCE.commit}`);
  const stamp = join(dir, 'sysassets.sha256');
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== SOURCE.assetsSha256) throw new Error('The asset pack is not the pinned one: run scripts/genesis/source.ts');
}

async function fetchSource(): Promise<void> {
  const dir = sourceDir();
  mkdirSync(dir, { recursive: true });
  const mh = join(dir, 'mh');
  if (!existsSync(mh)) {
    execFileSync('git', ['clone', '--filter=blob:none', '--sparse', '--no-checkout', SOURCE.repo, mh], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', mh, 'sparse-checkout', 'set', '--no-cone', ...SOURCE.paths], { stdio: 'inherit' });
  execFileSync('git', ['-C', mh, 'fetch', '--depth', '1', 'origin', SOURCE.commit], { stdio: 'inherit' });
  execFileSync('git', ['-C', mh, 'checkout', '--detach', SOURCE.commit], { stdio: 'inherit' });

  const zip = join(dir, 'sysassets.zip');
  if (!existsSync(zip)) {
    const response = await fetch(SOURCE.assets);
    if (!response.ok) throw new Error(`asset pack: HTTP ${response.status}`);
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  }
  const sum = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (sum !== SOURCE.assetsSha256) throw new Error(`asset pack checksum ${sum} is not the pinned one`);
  // The archive has no folder of its own: its hair/, eyes/… go under sysassets/.
  execFileSync('unzip', ['-q', '-o', zip, '-d', assetsDir()], { stdio: 'inherit' });
  writeFileSync(join(dir, 'sysassets.sha256'), sum);
  verifySource();
  console.log(`Genesis sources ready in ${dir}`);
}

if (process.argv[1]?.endsWith('source.ts')) {
  fetchSource().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
