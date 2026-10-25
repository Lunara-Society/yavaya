import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { roxiAvailability } from '@/server/domains/roxi/service';
import { welcomeRecording } from '@/server/domains/roxi/welcome';

export const dynamic = 'force-dynamic';

/**
 * The welcome voice note itself, for its recipient only.
 *
 * Which recording is served is decided here from the session, never from
 * the address, so no one can ask for someone else's note. The files live
 * outside `public/` for the same reason (next.config.ts traces them into
 * the build). Ranges are answered because Safari will not play audio that
 * cannot be fetched in pieces.
 */
const DIRECTORY = join(process.cwd(), 'src', 'server', 'assets', 'roxi-welcome');
const RECORDED_LANGUAGES = ['es', 'en'] as const;

const notFound = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  if (!roxiAvailability().available) return notFound();
  const session = await currentSession();
  if (!session) return notFound();
  const recording = await welcomeRecording(db(), { userId: session.user.userId, sessionId: session.sessionId, createdAt: session.createdAt });
  if (!recording) return notFound();

  const { locale } = await getTranslator();
  // Recorded in the site's two languages; any other falls back to the reference one.
  const language = (RECORDED_LANGUAGES as readonly string[]).includes(locale) ? locale : 'es';
  const audio = await readFile(join(DIRECTORY, `${recording.key}-${recording.variant}.${language}.mp3`)).catch(() => null);
  if (!audio) return notFound();

  const headers: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const size = audio.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    return new NextResponse(new Uint8Array(audio.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new NextResponse(new Uint8Array(audio), { headers: { ...headers, 'Content-Length': String(audio.length) } });
}
