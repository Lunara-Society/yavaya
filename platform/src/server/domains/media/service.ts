import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { media } from '@/server/db/schema';
import { errors } from '@/server/errors';
import { processImage } from './image';
import { mediaStorage, type MediaStorage } from './storage';

/**
 * Media service.
 *
 * Storing an image is two steps in two systems — the bucket and the
 * database — and they cannot share a transaction. The order is chosen so a
 * failure can only ever leave an orphaned *object*, never a database row
 * pointing at nothing: objects are written first (`storeImages`), rows are
 * inserted inside the caller's transaction (`insertMediaRows`), and if that
 * transaction fails the caller removes the objects (`discardStored`).
 */

export type StoredImage = {
  id: string;
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  sourceSha256: string;
};

function requireStorage(): MediaStorage {
  const storage = mediaStorage();
  if (!storage) throw errors.integrationUnconfigured('media_storage');
  return storage;
}

/** Validates, re-encodes and uploads each file. Nothing touches the database. */
export async function storeImages(
  params: { ownerUserId: string; purpose: string; files: Buffer[] },
): Promise<StoredImage[]> {
  const storage = requireStorage();
  // Process everything before uploading anything, so one bad file in a batch
  // rejects the batch without leaving the good ones behind in the bucket.
  const processed = [];
  for (const file of params.files) processed.push(await processImage(file));

  const stored: StoredImage[] = [];
  try {
    for (const image of processed) {
      const id = randomUUID();
      // Owner-scoped prefix makes a per-member purge a single listing call.
      const storageKey = `${params.purpose}/${params.ownerUserId}/${id}.webp`;
      await storage.put(storageKey, image.body, image.contentType);
      stored.push({
        id,
        storageKey,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        bytes: image.body.length,
        sourceSha256: image.sourceSha256,
      });
    }
  } catch (error) {
    await discardStored(stored);
    throw errors.internal('media upload failed', error);
  }
  return stored;
}

export async function insertMediaRows(
  tx: Executor,
  params: { ownerUserId: string; purpose: string; images: StoredImage[] },
): Promise<void> {
  if (params.images.length === 0) return;
  await tx.insert(media).values(
    params.images.map((image) => ({
      id: image.id,
      ownerUserId: params.ownerUserId,
      purpose: params.purpose,
      storageKey: image.storageKey,
      contentType: image.contentType,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      sourceSha256: image.sourceSha256,
    })),
  );
}

/** Best-effort cleanup of objects whose database rows never committed. */
export async function discardStored(images: Pick<StoredImage, 'storageKey'>[]): Promise<void> {
  const storage = mediaStorage();
  if (!storage) return;
  for (const image of images) {
    await storage.delete(image.storageKey).catch((error) => {
      console.error('orphaned media object could not be removed:', image.storageKey, error);
    });
  }
}

/**
 * Hashes of these images that another member has already uploaded — the
 * same photograph under two sellers is the classic copied listing.
 */
export async function hashesUsedByOthers(
  executor: Executor,
  params: { ownerUserId: string; hashes: string[] },
): Promise<string[]> {
  if (params.hashes.length === 0) return [];
  const rows = await executor
    .selectDistinct({ hash: media.sourceSha256 })
    .from(media)
    .where(and(inArray(media.sourceSha256, params.hashes), ne(media.ownerUserId, params.ownerUserId)));
  return rows.map((row) => row.hash);
}

/** Marks images removed. The objects go when the row does, not before. */
export async function markRemoved(tx: Executor, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(media)
    .set({ status: 'removed', removedAt: new Date() })
    .where(and(inArray(media.id, ids), eq(media.status, 'active')));
}

/** An active image's bytes, for the serving route. */
export async function readActiveImage(
  executor: Executor,
  id: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const storage = mediaStorage();
  if (!storage) return null;
  const [row] = await executor
    .select({ storageKey: media.storageKey, contentType: media.contentType })
    .from(media)
    .where(and(eq(media.id, id), eq(media.status, 'active')))
    .limit(1);
  if (!row) return null;
  const body = await storage.get(row.storageKey);
  return body ? { body, contentType: row.contentType } : null;
}
