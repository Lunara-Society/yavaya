import 'server-only';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { miradorVideos, miradorVoiceJobs } from '@/server/db/schema';
import { MIRADOR_RULES, WHATSAPP_RULES } from '@/config/business-rules';
import { serverEnv } from '@/config/env';
import { errors } from '@/server/errors';
import { mediaStorage } from '@/server/domains/media/storage';
import { actionCost, chargeForAction, refundAction } from '@/server/domains/tokens/service';
import { notify } from '@/server/domains/notifications/service';
import { recordAudit } from '@/server/domains/audit/service';

/**
 * Voiceover in Roxi's voice (docs/mirador/README.md, "Voiceover"): a member
 * writes — or asks Roxi to write — a few lines for their video, sees the
 * price, confirms, and gets the same video back with the voice laid over its
 * own sound and captions to read along.
 *
 * Money first, and only once: the tokens are charged in the same transaction
 * that records the job (the job's id is the charge's idempotency key); if the
 * voice cannot be made, they are refunded once (its own idempotency key) and
 * the member is told. The provider's price for the characters is kept on the
 * job so Admin sees what it cost against what it earned.
 *
 * The voice comes from ElevenLabs with Yavaya's own key (the owner's
 * account): Roxi's voices, the same as on WhatsApp. The video itself is not
 * re-encoded — the picture is copied, only the sound is mixed — so it takes
 * seconds and loses nothing.
 */

export type VoiceLanguage = 'es' | 'en';

const clean = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/** The longest script a video of this length can carry, in characters. */
export function maxCharsFor(durationMs: number): number {
  return Math.min(MIRADOR_RULES.voiceMaxChars, Math.floor((durationMs / 1000) * MIRADOR_RULES.voiceCharsPerSecond));
}

export function actionFor(characters: number): 'mirador.voiceover' | 'mirador.voiceover_long' {
  return characters <= MIRADOR_RULES.voiceShortChars ? 'mirador.voiceover' : 'mirador.voiceover_long';
}

/** What a voiceover costs now, short and long: shown before the member confirms. Null when it is switched off. */
export async function voicePrices(executor: Executor): Promise<{ short: number | null; long: number | null }> {
  const [short, long] = await Promise.all([actionCost(executor, 'mirador.voiceover'), actionCost(executor, 'mirador.voiceover_long')]);
  return { short, long };
}

export function voiceAvailable(): boolean {
  return Boolean(serverEnv().ELEVENLABS_API_KEY) && Boolean(mediaStorage());
}

/** False when this process was started without the web application's secrets (a bare scheduler, docs/DEPLOYMENT.md). */
function environmentComplete(): boolean {
  try {
    serverEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Records the job and charges for it. Refused before any charge when the
 * script is empty, longer than the video can carry, or this video already
 * has its narration or one is being made; `insufficient_tokens` when the member cannot
 * pay — and then nothing is recorded.
 */
export async function startVoiceover(
  tx: Executor,
  params: { userId: string; videoId: string; script: unknown; language: unknown; originalVolume: unknown; now?: Date },
): Promise<{ jobId: string; tokens: number }> {
  if (!voiceAvailable()) throw errors.validation('mirador.voice.error.unavailable');
  const [video] = await tx
    .select({ id: miradorVideos.id, status: miradorVideos.status, removedAt: miradorVideos.removedAt, durationMs: miradorVideos.durationMs })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, params.videoId), eq(miradorVideos.creatorUserId, params.userId)))
    .for('update');
  if (!video || video.status !== 'ready' || video.removedAt || !video.durationMs) throw errors.notFound('mirador_video');
  const script = clean(params.script).slice(0, MIRADOR_RULES.voiceMaxChars);
  if (script.length < 10) throw errors.validation('mirador.voice.error.short');
  const limit = maxCharsFor(video.durationMs);
  if (script.length > limit) throw errors.validation('mirador.voice.error.too_long', { max: limit, seconds: Math.round(video.durationMs / 1000) });
  const language: VoiceLanguage = params.language === 'en' ? 'en' : 'es';
  const volume = Math.max(0, Math.min(100, Math.round(Number(params.originalVolume ?? 25))));
  // One narration per video: a second would be laid over the first one's voice, not over the video's own sound.
  const [earlier] = await tx
    .select({ status: miradorVoiceJobs.status })
    .from(miradorVoiceJobs)
    .where(and(eq(miradorVoiceJobs.videoId, video.id), inArray(miradorVoiceJobs.status, ['charged', 'done'])))
    .limit(1);
  if (earlier) throw errors.conflict(earlier.status === 'done' ? 'mirador.voice.error.already' : 'mirador.voice.error.running');

  const actionKey = actionFor(script.length);
  const [job] = await tx
    .insert(miradorVoiceJobs)
    .values({
      videoId: video.id,
      userId: params.userId,
      script,
      voice: language,
      originalVolume: volume,
      characters: script.length,
      actionKey,
      tokens: 0,
      providerCostMicros: script.length * MIRADOR_RULES.voiceCostMicrosPerChar,
      createdAt: params.now ?? new Date(),
    })
    .returning({ id: miradorVoiceJobs.id });
  const charge = await chargeForAction(tx, { userId: params.userId, actionKey, idempotencyKey: `mirador.voice:${job!.id}`, relatedType: 'mirador_voice_job', relatedId: job!.id, metadata: { characters: script.length } });
  await tx.update(miradorVoiceJobs).set({ tokens: charge.cost }).where(eq(miradorVoiceJobs.id, job!.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'mirador.voice_requested', subjectType: 'mirador_video', subjectId: video.id, metadata: { job: job!.id, characters: script.length, tokens: charge.cost } });
  return { jobId: job!.id, tokens: charge.cost };
}

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

class Permanent extends Error {}

/** Roxi's voice for the script, with the time of each character (for the captions). */
export async function synthesize(script: string, language: VoiceLanguage, fetcher: typeof fetch = fetch): Promise<{ audio: Buffer; alignment: Alignment | null }> {
  const key = serverEnv().ELEVENLABS_API_KEY;
  if (!key) throw new Permanent('no ElevenLabs key');
  const voice = WHATSAPP_RULES.roxiVoices[language];
  // v4 first (the one that sounds spoken, as on WhatsApp); the multilingual model if v4 refuses timestamps.
  for (const model of ['eleven_v4', 'eleven_multilingual_v2']) {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text: script, model_id: model }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!response) throw new Error('ElevenLabs did not answer');
    if (response.ok) {
      const body = (await response.json()) as { audio_base64?: string; alignment?: Alignment | null };
      if (!body.audio_base64) throw new Error('ElevenLabs sent no audio');
      return { audio: Buffer.from(body.audio_base64, 'base64'), alignment: body.alignment ?? null };
    }
    const detail = await response.text().catch(() => '');
    console.warn(`mirador.voice tts model=${model} status=${response.status} ${detail.slice(0, 200)}`);
    // A refusal that will not change on retry (no credits, bad voice, no permission) ends the job; a server error is tried again later.
    if (response.status >= 500) throw new Error(`ElevenLabs ${response.status}`);
    if (model === 'eleven_multilingual_v2') throw new Permanent(`ElevenLabs ${response.status}`);
  }
  throw new Permanent('ElevenLabs refused');
}

const vttTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

/** Captions from the voice's timing: short lines (about two seconds, 42 characters), shifted by the voice's start. */
export function captionsFrom(alignment: Alignment, offsetSeconds: number): string {
  const words: Array<{ text: string; start: number; end: number }> = [];
  let current = { text: '', start: 0, end: 0 };
  alignment.characters.forEach((char, i) => {
    const start = alignment.character_start_times_seconds[i] ?? 0;
    const end = alignment.character_end_times_seconds[i] ?? start;
    if (/\s/.test(char)) {
      if (current.text) words.push(current);
      current = { text: '', start: 0, end: 0 };
      return;
    }
    if (!current.text) current.start = start;
    current.text += char;
    current.end = end;
  });
  if (current.text) words.push(current);
  const cues: string[] = [];
  let line: typeof words = [];
  const flush = () => {
    if (!line.length) return;
    cues.push(`${vttTime(line[0]!.start + offsetSeconds)} --> ${vttTime(line.at(-1)!.end + offsetSeconds)}\n${line.map((word) => word.text).join(' ')}`);
    line = [];
  };
  for (const word of words) {
    const text = [...line, word].map((w) => w.text).join(' ');
    if (line.length && (text.length > 42 || word.end - line[0]!.start > 2.4)) flush();
    line.push(word);
    if (/[.!?…]$/.test(word.text)) flush();
  }
  flush();
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 3 * 60_000);
    child.stderr.on('data', (chunk: Buffer) => {
      if (err.length < 1500) err += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 400)}`));
    });
  });
}

/** The voice starts a beat after the picture, as a narrator would. */
const LEAD_SECONDS = 0.3;

/** Lays the voice over one encoding: the picture copied as it is, the video's own sound turned down beneath. */
export async function mixVoice(params: { video: string; voice: string; output: string; originalVolume: number; hasAudio: boolean; bitrate: string }): Promise<void> {
  const lead = Math.round(LEAD_SECONDS * 1000);
  const filter = params.hasAudio
    ? `[0:a]volume=${(params.originalVolume / 100).toFixed(2)}[a0];[1:a]adelay=${lead}|${lead},apad[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0[a]`
    : `[1:a]adelay=${lead}|${lead},apad[a]`;
  await ffmpeg([
    '-i', params.video, '-i', params.voice,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', params.bitrate, '-ac', '2', '-ar', '44100',
    '-shortest', '-movflags', '+faststart', '-map_metadata', '-1',
    params.output,
  ]);
}

async function download(key: string, file: string): Promise<void> {
  const storage = mediaStorage();
  const stored = await storage?.stream?.(key);
  if (stored && !('unsatisfiable' in stored) && stored.body) {
    await pipeline(Readable.fromWeb(stored.body as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(file));
    return;
  }
  const body = await storage?.get(key);
  if (!body) throw new Error('video file missing');
  await writeFile(file, body);
}

let queue: Promise<unknown> = Promise.resolve();

/** Makes a charged narration, after any already running on this server. */
export function runVoiceover(database: Database, jobId: string, fetcher: typeof fetch = fetch): Promise<'done' | 'refunded' | 'retry' | 'skipped'> {
  const next = queue.then(() => runNow(database, jobId, fetcher));
  queue = next.catch(() => undefined);
  return next;
}

async function runNow(database: Database, jobId: string, fetcher: typeof fetch): Promise<'done' | 'refunded' | 'retry' | 'skipped'> {
  const now = new Date();
  const stale = new Date(now.getTime() - 10 * 60_000);
  const [job] = await database
    .update(miradorVoiceJobs)
    .set({ attempts: sql`${miradorVoiceJobs.attempts} + 1`, startedAt: now })
    .where(and(eq(miradorVoiceJobs.id, jobId), eq(miradorVoiceJobs.status, 'charged'), lt(miradorVoiceJobs.attempts, MIRADOR_RULES.voiceAttempts), or(isNull(miradorVoiceJobs.startedAt), lt(miradorVoiceJobs.startedAt, stale))))
    .returning();
  if (!job) return 'skipped';
  const storage = mediaStorage();
  const dir = await mkdtemp(join(tmpdir(), 'mirador-voice-'));
  try {
    const [video] = await database.select().from(miradorVideos).where(eq(miradorVideos.id, job.videoId)).limit(1);
    if (!storage || !video || video.status !== 'ready' || video.removedAt || !video.playbackKey || !video.lowKey) throw new Permanent('video gone');
    const { audio, alignment } = await synthesize(job.script, job.voice === 'en' ? 'en' : 'es', fetcher);
    const voice = join(dir, 'voice.mp3');
    await writeFile(voice, audio);
    const [high, low] = [join(dir, 'high.mp4'), join(dir, 'low.mp4')];
    await download(video.playbackKey, high);
    await download(video.lowKey, low);
    const version = video.version + 1;
    const keys = { high: `mirador/v/${video.id}/720-${version}.mp4`, low: `mirador/v/${video.id}/360-${version}.mp4`, captions: `mirador/v/${video.id}/captions-${version}.vtt` };
    await mixVoice({ video: high, voice, output: join(dir, 'high-out.mp4'), originalVolume: job.originalVolume, hasAudio: video.hasAudio, bitrate: '96k' });
    await mixVoice({ video: low, voice, output: join(dir, 'low-out.mp4'), originalVolume: job.originalVolume, hasAudio: video.hasAudio, bitrate: '64k' });
    const [highBody, lowBody] = await Promise.all([readFile(join(dir, 'high-out.mp4')), readFile(join(dir, 'low-out.mp4'))]);
    await storage.put(keys.high, highBody, 'video/mp4');
    await storage.put(keys.low, lowBody, 'video/mp4');
    const captions = alignment ? captionsFrom(alignment, LEAD_SECONDS) : null;
    if (captions) await storage.put(keys.captions, Buffer.from(captions), 'text/vtt');
    const old = [video.playbackKey, video.lowKey, video.captionsKey].filter((key): key is string => Boolean(key));
    await database.transaction(async (tx) => {
      await tx
        .update(miradorVideos)
        .set({ playbackKey: keys.high, lowKey: keys.low, captionsKey: captions ? keys.captions : null, playbackBytes: highBody.length, lowBytes: lowBody.length, hasAudio: true, version, updatedAt: new Date() })
        .where(eq(miradorVideos.id, video.id));
      await tx.update(miradorVoiceJobs).set({ status: 'done', finishedAt: new Date(), failure: null }).where(eq(miradorVoiceJobs.id, job.id));
      await notify(tx, [{ userId: job.userId, category: 'mirador', type: 'mirador.voice_ready', titleKey: 'mirador.notify.voice_ready', href: `/mirador/v/${video.id}`, dedupeKey: `mirador.voice_ready:${job.id}`, subjectId: video.id }]);
    });
    await Promise.all(old.map((key) => storage.delete(key).catch(() => undefined)));
    return 'done';
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'failed';
    console.error('mirador.voice', job.id, message);
    if (error instanceof Permanent || job.attempts >= MIRADOR_RULES.voiceAttempts) {
      await refund(database, job.id, message);
      return 'refunded';
    }
    await database.update(miradorVoiceJobs).set({ failure: message }).where(eq(miradorVoiceJobs.id, job.id));
    return 'retry';
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The tokens back, once, and the member told. */
async function refund(database: Database, jobId: string, failure: string): Promise<void> {
  await database.transaction(async (tx) => {
    const [job] = await tx.select().from(miradorVoiceJobs).where(eq(miradorVoiceJobs.id, jobId)).for('update');
    if (!job || job.status !== 'charged') return;
    if (job.tokens > 0) {
      await refundAction(tx, { userId: job.userId, amount: job.tokens, idempotencyKey: `mirador.voice-refund:${job.id}`, relatedType: 'mirador_voice_job', relatedId: job.id, note: 'Mirador voiceover could not be made' });
    }
    await tx.update(miradorVoiceJobs).set({ status: 'refunded', failure, finishedAt: new Date() }).where(eq(miradorVoiceJobs.id, job.id));
    await notify(tx, [{ userId: job.userId, category: 'mirador', type: 'mirador.voice_failed', titleKey: 'mirador.notify.voice_failed', params: { count: job.tokens }, href: '/mirador/estudio', dedupeKey: `mirador.voice_failed:${job.id}`, subjectId: job.videoId }]);
  });
}

/** The scheduler's pass: narrations cut short are made again; those out of tries are refunded. */
export async function sweepVoiceovers(database: Database, now = new Date(), fetcher: typeof fetch = fetch): Promise<{ done: number; refunded: number }> {
  // A scheduler without the web secrets cannot read the ElevenLabs key either; a job it touched would
  // only burn an attempt and be refunded. The jobs wait, still charged, for a tick that has them.
  if (!environmentComplete()) return { done: 0, refunded: 0 };
  const stale = new Date(now.getTime() - 10 * 60_000);
  const rows = await database
    .select({ id: miradorVoiceJobs.id, attempts: miradorVoiceJobs.attempts })
    .from(miradorVoiceJobs)
    .where(and(eq(miradorVoiceJobs.status, 'charged'), or(isNull(miradorVoiceJobs.startedAt), lt(miradorVoiceJobs.startedAt, stale))))
    .limit(10);
  let done = 0;
  let refunded = 0;
  for (const row of rows) {
    if (row.attempts >= MIRADOR_RULES.voiceAttempts) {
      await refund(database, row.id, 'out of tries');
      refunded++;
      continue;
    }
    const outcome = await runVoiceover(database, row.id, fetcher);
    if (outcome === 'done') done++;
    if (outcome === 'refunded') refunded++;
  }
  return { done, refunded };
}

/** The creator's narrations of a video: the one being made, and what each cost. */
export async function voiceJobsFor(executor: Executor, params: { userId: string; videoIds: string[] }) {
  if (!params.videoIds.length) return [];
  return executor
    .select({ id: miradorVoiceJobs.id, videoId: miradorVoiceJobs.videoId, status: miradorVoiceJobs.status, tokens: miradorVoiceJobs.tokens, createdAt: miradorVoiceJobs.createdAt })
    .from(miradorVoiceJobs)
    .where(and(eq(miradorVoiceJobs.userId, params.userId), inArray(miradorVoiceJobs.videoId, params.videoIds)))
    .orderBy(sql`${miradorVoiceJobs.createdAt} desc`)
    .limit(200);
}

/** For Admin: narrations made and refunded, tokens earned, and what ElevenLabs charged for them. */
export async function voiceTotals(executor: Executor) {
  const [row] = await executor
    .select({
      done: sql<number>`count(*) filter (where ${miradorVoiceJobs.status} = 'done')::int`,
      refunded: sql<number>`count(*) filter (where ${miradorVoiceJobs.status} = 'refunded')::int`,
      running: sql<number>`count(*) filter (where ${miradorVoiceJobs.status} = 'charged')::int`,
      tokens: sql<number>`coalesce(sum(${miradorVoiceJobs.tokens}) filter (where ${miradorVoiceJobs.status} = 'done'), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${miradorVoiceJobs.providerCostMicros}) filter (where ${miradorVoiceJobs.status} = 'done'), 0)::bigint`,
    })
    .from(miradorVoiceJobs);
  return { done: Number(row?.done ?? 0), refunded: Number(row?.refunded ?? 0), running: Number(row?.running ?? 0), tokens: Number(row?.tokens ?? 0), costUsd: Number(row?.costMicros ?? 0) / 1_000_000 };
}
