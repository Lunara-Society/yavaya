import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverEnv } from '@/config/env';
import { guideObjectKey } from '@/config/guide';
import { db } from '@/server/db/client';
import { recordAudit } from '@/server/domains/audit/service';
import { mediaStorage } from '@/server/domains/media/storage';

export const dynamic = 'force-dynamic';

/**
 * The operator channel that puts the guide videos into the media bucket.
 *
 * It exists because the bucket's keys are not handed out: the site itself
 * writes, in parts small enough to pass any proxy (start, part, part…,
 * complete). It answers 404 unless GUIDE_UPLOAD_TOKEN is set, and only with
 * that token; set it for an upload and blank it afterwards. It can write
 * nothing but the guide file names in config/guide.ts, and every finished
 * file is recorded in the audit log.
 */
const PART_MAX_BYTES = 16 * 1024 * 1024;

function authorised(request: Request): boolean {
  const token = serverEnv().GUIDE_UPLOAD_TOKEN;
  if (!token) return false;
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  // Compare digests so the comparison takes the same time whatever was sent.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

const startSchema = z.object({ action: z.literal('start'), file: z.string() });
const completeSchema = z.object({
  action: z.literal('complete'),
  file: z.string(),
  uploadId: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1) })).min(1).max(10_000),
});
const abortSchema = z.object({ action: z.literal('abort'), file: z.string(), uploadId: z.string().min(1) });

export async function POST(request: Request) {
  if (!authorised(request)) return new NextResponse(null, { status: 404 });
  const writer = mediaStorage()?.multipart;
  if (!writer) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  const body: unknown = await request.json().catch(() => null);

  const start = startSchema.safeParse(body);
  if (start.success) {
    const key = guideObjectKey(start.data.file);
    if (!key) return NextResponse.json({ error: 'unknown_file' }, { status: 400 });
    return NextResponse.json({ uploadId: await writer.start(key, 'video/mp4') });
  }
  const complete = completeSchema.safeParse(body);
  if (complete.success) {
    const key = guideObjectKey(complete.data.file);
    if (!key) return NextResponse.json({ error: 'unknown_file' }, { status: 400 });
    const parts = [...complete.data.parts].sort((x, y) => x.partNumber - y.partNumber);
    await writer.complete(key, complete.data.uploadId, parts);
    await db().transaction((tx) =>
      recordAudit(tx, { actorType: 'system', action: 'guide.video_uploaded', subjectType: 'guide_video', subjectId: complete.data.file, metadata: { parts: parts.length } }),
    );
    return NextResponse.json({ ok: true });
  }
  const abort = abortSchema.safeParse(body);
  if (abort.success) {
    const key = guideObjectKey(abort.data.file);
    if (!key) return NextResponse.json({ error: 'unknown_file' }, { status: 400 });
    await writer.abort(key, abort.data.uploadId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}

/** One part: PUT ?file=…&uploadId=…&part=N with the bytes as the body. */
export async function PUT(request: Request) {
  if (!authorised(request)) return new NextResponse(null, { status: 404 });
  const writer = mediaStorage()?.multipart;
  if (!writer) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  const url = new URL(request.url);
  const key = guideObjectKey(url.searchParams.get('file') ?? '');
  const uploadId = url.searchParams.get('uploadId') ?? '';
  const partNumber = Number(url.searchParams.get('part'));
  if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PART_MAX_BYTES) return NextResponse.json({ error: 'bad_size' }, { status: 413 });
  return NextResponse.json({ etag: await writer.part(key, uploadId, partNumber, bytes) });
}
