import 'server-only';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database } from '@/server/db/client';
import { miradorVideos } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { mediaStorage } from '@/server/domains/media/storage';

/**
 * Turning a member's file into the videos Mirador plays
 * (docs/mirador/README.md, "Processing").
 *
 * ffprobe reads the file first and refuses what is not a short video, with a
 * reason the member is shown. ffmpeg then writes two encodings — 720p for
 * most viewers, 360p for slow connections and data savers — and a still for
 * the poster. Each is H.264 and AAC in an MP4 with its index at the front, so
 * a phone starts playing after the first bytes and can seek at once.
 *
 * Never upscaled: a small video stays its size. Never rotated wrong: ffmpeg
 * applies the phone's rotation and writes upright pixels. Never carrying the
 * phone's metadata: `-map_metadata -1` drops the place it was filmed, the
 * device and the date, which the member did not mean to publish.
 *
 * A file is someone else's input to a program that parses it, so: only the
 * containers phones record are accepted (a playlist that names network
 * addresses or other files is refused by its format before ffmpeg plays
 * it), only local files may be opened (`-protocol_whitelist file,pipe`), and
 * every run has a time limit. One video is processed at a time per server,
 * on two threads, so encoding never starves the site of its CPU.
 */

/** Containers phones and cameras write, as ffprobe names them. */
const ACCEPTED_FORMATS = ['mov', 'mp4', 'm4a', '3gp', '3g2', 'matroska', 'webm'];
const RUN_LIMIT_MS = 5 * 60_000;
const PROTOCOLS = ['-protocol_whitelist', 'file,pipe'];

type Probe = { durationMs: number; width: number; height: number; hasAudio: boolean; formats: string[] };

export type ProcessOutcome = { status: 'ready' | 'failed' | 'skipped' | 'retry'; reason?: string };

class Refused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function run(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_LIMIT_MS);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      if (err.length < 2000) err += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${command} exited ${code}: ${err.slice(0, 500)}`));
    });
  });
}

export async function probe(file: string): Promise<Probe> {
  const raw = await run('ffprobe', [...PROTOCOLS, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const data = JSON.parse(raw.toString()) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }>;
  };
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  const rotation = Math.abs(Number(video?.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0)) % 180;
  const [w, h] = [video?.width ?? 0, video?.height ?? 0];
  return {
    durationMs: Math.round(Number(data.format?.duration ?? 0) * 1000),
    // As the viewer sees it: a portrait phone video is stored landscape with a 90° rotation.
    width: rotation === 90 ? h : w,
    height: rotation === 90 ? w : h,
    hasAudio: Boolean(data.streams?.some((stream) => stream.codec_type === 'audio')),
    formats: (data.format?.format_name ?? '').split(','),
  };
}

/** Refuses what is not a short video, with the reason the member will read. */
export function checkProbe(found: Probe): void {
  if (!found.formats.some((format) => ACCEPTED_FORMATS.includes(format))) throw new Refused('mirador.error.not_video');
  if (!found.width || !found.height || !found.durationMs) throw new Refused('mirador.error.not_video');
  if (found.durationMs < MIRADOR_RULES.minDurationSeconds * 1000) throw new Refused('mirador.error.too_short');
  // A second of grace: phones round a "90 second" recording up.
  if (found.durationMs > (MIRADOR_RULES.maxDurationSeconds + 1) * 1000) throw new Refused('mirador.error.too_long');
}

/** Fits inside the box (portrait or landscape alike), never larger than it was, even sides for H.264. */
function scale(long: number, short: number): string {
  return `scale=w='min(iw,if(gt(iw,ih),${long},${short}))':h='min(ih,if(gt(iw,ih),${short},${long}))':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`;
}

async function encode(input: string, output: string, rendition: '720' | '360'): Promise<void> {
  const high = rendition === '720';
  await run('ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    ...PROTOCOLS,
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', high ? scale(1280, 720) : scale(640, 360),
    '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high',
    '-crf', high ? '26' : '30', '-maxrate', high ? '2500k' : '700k', '-bufsize', high ? '5000k' : '1400k', '-g', '60',
    '-c:a', 'aac', '-b:a', high ? '96k' : '64k', '-ac', '2', '-ar', '44100',
    '-movflags', '+faststart', '-map_metadata', '-1', '-map_chapters', '-1',
    '-threads', '2',
    output,
  ]);
}

async function poster(input: string, durationMs: number): Promise<Buffer> {
  const at = Math.min(1, (durationMs / 1000) * 0.25).toFixed(2);
  const png = await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', ...PROTOCOLS, '-ss', at, '-i', input, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1']);
  return sharp(png).resize({ width: 720, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
}

async function download(key: string, file: string): Promise<void> {
  const storage = mediaStorage();
  if (!storage) throw new Error('media storage not configured');
  if (storage.stream) {
    const stored = await storage.stream(key);
    if (!stored || 'unsatisfiable' in stored || !stored.body) throw new Error('original missing');
    await pipeline(Readable.fromWeb(stored.body as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(file));
    return;
  }
  const body = await storage.get(key);
  if (!body) throw new Error('original missing');
  await writeFile(file, body);
}

export const playbackKeys = (id: string) => ({ high: `mirador/v/${id}/720.mp4`, low: `mirador/v/${id}/360.mp4`, poster: `mirador/v/${id}/poster.webp` });

/**
 * Claims a video for processing: only one server works on it, and one stuck
 * past its time is claimed again. Null when someone else has it, it is not
 * waiting, or it has had all its tries.
 */
async function claim(database: Database, id: string, now: Date) {
  const stale = new Date(now.getTime() - MIRADOR_RULES.processingStaleMinutes * 60_000);
  const [row] = await database
    .update(miradorVideos)
    .set({ processingStartedAt: now, processingAttempts: sql`${miradorVideos.processingAttempts} + 1`, updatedAt: now })
    .where(
      and(
        eq(miradorVideos.id, id),
        eq(miradorVideos.status, 'processing'),
        lt(miradorVideos.processingAttempts, MIRADOR_RULES.processingAttempts),
        or(isNull(miradorVideos.processingStartedAt), lt(miradorVideos.processingStartedAt, stale)),
      ),
    )
    .returning({ id: miradorVideos.id, originalKey: miradorVideos.originalKey, publishedAt: miradorVideos.publishedAt });
  return row ?? null;
}

let queue: Promise<unknown> = Promise.resolve();

/** Processes one video, after any already running on this server. */
export function processVideo(database: Database, id: string): Promise<ProcessOutcome> {
  const next = queue.then(() => processNow(database, id));
  queue = next.catch(() => undefined);
  return next;
}

async function processNow(database: Database, id: string): Promise<ProcessOutcome> {
  const storage = mediaStorage();
  if (!storage) return { status: 'retry', reason: 'storage' };
  const now = new Date();
  const row = await claim(database, id, now);
  if (!row) return { status: 'skipped' };
  if (!row.originalKey) return fail(database, id, 'mirador.error.processing');

  const dir = await mkdtemp(join(tmpdir(), 'mirador-'));
  const input = join(dir, 'original');
  try {
    await download(row.originalKey, input);
    const found = await probe(input);
    checkProbe(found);
    const [high, low] = [join(dir, '720.mp4'), join(dir, '360.mp4')];
    await encode(input, high, '720');
    await encode(input, low, '360');
    const out = await probe(high);
    const still = await poster(high, out.durationMs);
    const keys = playbackKeys(id);
    const [highBody, lowBody] = await Promise.all([readFile(high), readFile(low)]);
    await storage.put(keys.high, highBody, 'video/mp4');
    await storage.put(keys.low, lowBody, 'video/mp4');
    await storage.put(keys.poster, still, 'image/webp');
    const ready = new Date();
    const [updated] = await database
      .update(miradorVideos)
      .set({
        status: 'ready',
        playbackKey: keys.high,
        lowKey: keys.low,
        posterKey: keys.poster,
        playbackBytes: highBody.length,
        lowBytes: lowBody.length,
        durationMs: out.durationMs,
        width: out.width,
        height: out.height,
        hasAudio: out.hasAudio,
        originalKey: null,
        failureReason: null,
        readyAt: ready,
        // Asked to be published while it was being processed: it goes up now, at the top of the newest.
        publishedAt: row.publishedAt ? ready : null,
        updatedAt: ready,
      })
      .where(and(eq(miradorVideos.id, id), eq(miradorVideos.status, 'processing')))
      .returning({ id: miradorVideos.id });
    if (!updated) {
      // Removed while it was processing: what was written is not needed.
      await Promise.all([keys.high, keys.low, keys.poster].map((key) => storage.delete(key).catch(() => undefined)));
      return { status: 'skipped' };
    }
    await storage.delete(row.originalKey).catch(() => undefined);
    return { status: 'ready' };
  } catch (error) {
    if (error instanceof Refused) {
      await storage.delete(row.originalKey).catch(() => undefined);
      return fail(database, id, error.reason);
    }
    console.error('mirador.process', id, error instanceof Error ? error.message.slice(0, 300) : 'failed');
    return { status: 'retry', reason: 'error' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function fail(database: Database, id: string, reason: string): Promise<ProcessOutcome> {
  await database
    .update(miradorVideos)
    .set({ status: 'failed', failureReason: reason, originalKey: null, updatedAt: new Date() })
    .where(and(eq(miradorVideos.id, id), eq(miradorVideos.status, 'processing')));
  return { status: 'failed', reason };
}

/**
 * The scheduler's pass: videos waiting or stuck are processed again, and
 * those out of tries are failed (their original deleted). Returns counts.
 */
export async function sweepProcessing(database: Database, now = new Date()): Promise<{ processed: number; failed: number }> {
  const stale = new Date(now.getTime() - MIRADOR_RULES.processingStaleMinutes * 60_000);
  const exhausted = await database
    .select({ id: miradorVideos.id, key: miradorVideos.originalKey })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.status, 'processing'), sql`${miradorVideos.processingAttempts} >= ${MIRADOR_RULES.processingAttempts}`, lt(miradorVideos.processingStartedAt, stale)));
  for (const row of exhausted) {
    if (row.key) await mediaStorage()?.delete(row.key).catch(() => undefined);
    await fail(database, row.id, 'mirador.error.processing');
  }
  const waiting = await database
    .select({ id: miradorVideos.id })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.status, 'processing'), lt(miradorVideos.processingAttempts, MIRADOR_RULES.processingAttempts), or(isNull(miradorVideos.processingStartedAt), lt(miradorVideos.processingStartedAt, stale))))
    .limit(5);
  let processed = 0;
  for (const row of waiting) if ((await processVideo(database, row.id)).status === 'ready') processed++;
  return { processed, failed: exhausted.length };
}
