import 'server-only';
import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { playProfiles } from '@/server/db/schema';
import { LOOK_OPTIONS, LOOK_PARTS, parseLook, type Look } from '@/config/play-looks';

/**
 * A Yavaya Play character, kept on the account (docs/PLAY.md).
 *
 * Only a look made entirely of known ids is stored: the client offers the
 * catalogue in config/play-looks.ts and nothing else, so anything outside it
 * is a client that is not ours and is refused rather than repaired.
 */

/** A complete look of known ids, or null. Stricter than `parseLook`, which repairs. */
export function exactLook(value: unknown): Look | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  if (Object.keys(given).some((part) => !(LOOK_PARTS as readonly string[]).includes(part))) return null;
  for (const part of LOOK_PARTS) {
    const id = given[part];
    if (typeof id !== 'string' || !LOOK_OPTIONS[part].some((option) => option.id === id)) return null;
  }
  return parseLook(given);
}

export async function playLook(executor: Executor, userId: string): Promise<Look | null> {
  const [row] = await executor.select({ look: playProfiles.look }).from(playProfiles).where(eq(playProfiles.userId, userId)).limit(1);
  // Read through `parseLook`: a look saved before an option was retired comes back with the default in its place.
  return row ? parseLook(row.look) : null;
}

export async function savePlayLook(executor: Executor, userId: string, look: Look): Promise<void> {
  const now = new Date();
  await executor
    .insert(playProfiles)
    .values({ userId, look, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: playProfiles.userId, set: { look, updatedAt: now } });
}
