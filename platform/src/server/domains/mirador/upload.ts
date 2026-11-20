import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { miradorVideos } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { mediaStorage } from '@/server/domains/media/storage';
import { recordAudit } from '@/server/domains/audit/service';

/**
 * Getting a member's video into the bucket (docs/mirador/README.md, "Upload").
 *
 * In parts, straight into the bucket's own multipart upload: the phone sends
 * one part at a time (MIRADOR_RULES.partBytes), the server passes each on and
 * keeps only its receipt, so no request ever holds a whole video and a
 * dropped connection costs one part, not the upload. Parts go through the
 * application rather than to the bucket directly because the bucket does not
 * accept uploads from browsers (that needs its CORS rules and signed links,
 * the next step when traffic calls for it).
 *
 * Nothing here decides whether the file is a usable video: the processing
 * step (process.ts) reads it with ffprobe and refuses it there, with a
 * reason the member is shown.
 */

/** What phones and cameras record: checked again, properly, by ffprobe. */
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska', 'video/x-m4v'] as const;

const originalKey = (id: string) => `mirador/original/${id}`;

export function partCount(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / MIRADOR_RULES.partBytes));
}

/** The size part `n` (from 1) must be: every part full but the last. */
export function partSize(bytes: number, n: number): number {
  const count = partCount(bytes);
  if (n < 1 || n > count) return -1;
  return n < count ? MIRADOR_RULES.partBytes : bytes - MIRADOR_RULES.partBytes * (count - 1);
}

export async function startUpload(
  tx: Executor,
  params: { userId: string; bytes: number; contentType: string; language: string; now?: Date },
): Promise<{ videoId: string; partBytes: number; parts: number }> {
  const storage = mediaStorage();
  if (!storage?.multipart) throw errors.validation('mirador.error.unavailable');
  if (!Number.isInteger(params.bytes) || params.bytes <= 0) throw errors.validation('mirador.error.not_video');
  if (params.bytes > MIRADOR_RULES.maxUploadBytes) throw errors.validation('mirador.error.too_large', { mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024) });
  if (!(VIDEO_TYPES as readonly string[]).includes(params.contentType)) throw errors.validation('mirador.error.not_video');

  const id = randomUUID();
  const key = originalKey(id);
  const uploadId = await storage.multipart.start(key, params.contentType);
  await tx.insert(miradorVideos).values({
    id,
    creatorUserId: params.userId,
    status: 'uploading',
    language: params.language === 'en' ? 'en' : 'es',
    originalKey: key,
    originalBytes: params.bytes,
    uploadId,
    createdAt: params.now ?? new Date(),
  });
  return { videoId: id, partBytes: MIRADOR_RULES.partBytes, parts: partCount(params.bytes) };
}

async function ownUploading(executor: Executor, userId: string, videoId: string) {
  const [row] = await executor
    .select()
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, videoId), eq(miradorVideos.creatorUserId, userId)))
    .limit(1);
  if (!row) throw errors.notFound('mirador_video');
  if (row.status !== 'uploading' || !row.uploadId || !row.originalKey || !row.originalBytes) throw errors.conflict('mirador.error.upload_done');
  return row;
}

/**
 * One part: checked for its size, passed to the bucket, its receipt kept.
 * Sending the same part again replaces it (a retry after a dropped
 * connection), never adds a second one.
 */
export async function putPart(executor: Executor, params: { userId: string; videoId: string; partNumber: number; body: Buffer }): Promise<{ received: number; parts: number }> {
  const storage = mediaStorage();
  if (!storage?.multipart) throw errors.validation('mirador.error.unavailable');
  const row = await ownUploading(executor, params.userId, params.videoId);
  const expected = partSize(row.originalBytes!, params.partNumber);
  if (expected < 0 || params.body.length !== expected) throw errors.validation('mirador.error.part');

  // Slow (the bucket), so outside any transaction; the receipt is merged under a row lock after.
  const etag = await storage.multipart.part(row.originalKey!, row.uploadId!, params.partNumber, params.body);
  const parts = await executor.transaction(async (tx) => {
    const [locked] = await tx.select({ parts: miradorVideos.uploadParts, status: miradorVideos.status }).from(miradorVideos).where(eq(miradorVideos.id, row.id)).for('update');
    if (!locked || locked.status !== 'uploading') throw errors.conflict('mirador.error.upload_done');
    const merged = [...locked.parts.filter((part) => part.partNumber !== params.partNumber), { partNumber: params.partNumber, etag, bytes: params.body.length }].sort((a, b) => a.partNumber - b.partNumber);
    await tx.update(miradorVideos).set({ uploadParts: merged, updatedAt: new Date() }).where(eq(miradorVideos.id, row.id));
    return merged;
  });
  return { received: parts.length, parts: partCount(row.originalBytes!) };
}

/**
 * Every part is in: the bucket joins them into one file, and the video waits
 * for processing. Answers with the video id; processing starts after the
 * response (the route's job) and the scheduler picks up any it missed.
 */
export async function completeUpload(tx: Executor, params: { userId: string; videoId: string; now?: Date }): Promise<void> {
  const storage = mediaStorage();
  if (!storage?.multipart) throw errors.validation('mirador.error.unavailable');
  const [row] = await tx
    .select()
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, params.videoId), eq(miradorVideos.creatorUserId, params.userId)))
    .for('update');
  if (!row) throw errors.notFound('mirador_video');
  if (row.status !== 'uploading' || !row.uploadId || !row.originalKey || !row.originalBytes) throw errors.conflict('mirador.error.upload_done');
  const count = partCount(row.originalBytes);
  const parts = row.uploadParts;
  const complete = parts.length === count && parts.every((part, i) => part.partNumber === i + 1) && parts.reduce((sum, part) => sum + part.bytes, 0) === row.originalBytes;
  if (!complete) throw errors.validation('mirador.error.part');

  await storage.multipart.complete(row.originalKey, row.uploadId, parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })));
  await tx
    .update(miradorVideos)
    .set({ status: 'processing', uploadId: null, uploadParts: [], processingStartedAt: null, updatedAt: params.now ?? new Date() })
    .where(eq(miradorVideos.id, row.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'mirador.video_uploaded', subjectType: 'mirador_video', subjectId: row.id, metadata: { bytes: row.originalBytes } });
}

/** The member gave up on an upload: its parts are thrown away and the row with them. */
export async function abandonUpload(tx: Executor, params: { userId: string; videoId: string }): Promise<void> {
  const row = await ownUploading(tx, params.userId, params.videoId);
  await mediaStorage()?.multipart?.abort(row.originalKey!, row.uploadId!).catch(() => undefined);
  await tx.delete(miradorVideos).where(eq(miradorVideos.id, row.id));
}

/** Uploads left unfinished past their time (the scheduler): their parts aborted in the bucket, their rows gone. */
export async function expireUploads(executor: Executor, params: { now?: Date; limit?: number } = {}): Promise<number> {
  const before = new Date((params.now ?? new Date()).getTime() - MIRADOR_RULES.uploadKeepHours * 3_600_000);
  const rows = await executor
    .select({ id: miradorVideos.id, key: miradorVideos.originalKey, uploadId: miradorVideos.uploadId })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.status, 'uploading'), lt(miradorVideos.createdAt, before)))
    .limit(params.limit ?? 100);
  for (const row of rows) {
    if (row.key && row.uploadId) await mediaStorage()?.multipart?.abort(row.key, row.uploadId).catch(() => undefined);
    await executor.delete(miradorVideos).where(and(eq(miradorVideos.id, row.id), eq(miradorVideos.status, 'uploading')));
  }
  return rows.length;
}
