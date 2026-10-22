import { closeDb, db } from '@/server/db/client';
import { resealUnderCurrentKeys } from './reseal';

/**
 * The release step's third part (scripts/release.cjs): reseals text left
 * under a retired key. Does nothing, quickly, when no `…_PREVIOUS` key is set.
 */
async function main() {
  const reports = await resealUnderCurrentKeys(db());
  if (reports.length === 0) {
    console.log('reseal: no previous keys set, nothing to do');
  } else {
    for (const r of reports) console.log(`reseal ${r.target}: ${r.resealed} resealed, ${r.alreadyCurrent} already current, ${r.unreadable} unreadable with either key`);
    if (reports.every((r) => r.resealed === 0 && r.unreadable === 0)) console.log('reseal: everything is under the current keys — the …_PREVIOUS variables can be removed');
  }
  await closeDb();
}

main().catch((error) => {
  console.error('reseal failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
