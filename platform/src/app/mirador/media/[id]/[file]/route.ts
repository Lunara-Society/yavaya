import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { miradorVideos } from '@/server/db/schema';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { mediaStorage, type ByteRange } from '@/server/domains/media/storage';
import { miradorOpen } from '@/server/domains/mirador/access';

export const dynamic = 'force-dynamic';

/**
 * A Mirador video's files: its 720p and 360p encodings, in the byte ranges a
 * player asks for, and its poster.
 *
 * A published video is anyone's to watch (once Mirador is open); one not
 * yet published, or taken down, only its creator's and a moderator's. The
 * files of one video never change, so a public one may be cached by the
 * browser — for an hour, not for good, so a video taken down stops playing
 * on phones that kept it.
 *
 * Served through the application for now, like the guide videos; a CDN in
 * front of the bucket is the step for when traffic asks for it
 * (docs/mirador/README.md, "Delivery").
 */
const FILES = { '720.mp4': { column: 'playbackKey', type: 'video/mp4' }, '360.mp4': { column: 'lowKey', type: 'video/mp4' }, 'poster.webp': { column: 'posterKey', type: 'image/webp' } } as const;
type FileName = keyof typeof FILES;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRange(header: string | null): ByteRange | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && end < start) return 'invalid';
  return { start, end };
}

async function serve(request: Request, id: string, file: string, withBody: boolean) {
  const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!UUID.test(id) || !Object.hasOwn(FILES, file)) return notFound();
  const spec = FILES[file as FileName];
  const [video] = await db()
    .select({ status: miradorVideos.status, creator: miradorVideos.creatorUserId, publishedAt: miradorVideos.publishedAt, removedAt: miradorVideos.removedAt, key: miradorVideos[spec.column] })
    .from(miradorVideos)
    .where(eq(miradorVideos.id, id))
    .limit(1);
  if (!video || video.status !== 'ready' || !video.key) return notFound();

  const isPublic = Boolean(video.publishedAt) && !video.removedAt;
  const session = await currentSession();
  const userId = session?.user.userId ?? null;
  if (isPublic) {
    if (!(await miradorOpen(db(), userId))) return notFound();
  } else if (!userId || (userId !== video.creator && !(await hasPermission(db(), userId, 'moderation.queue.read')))) {
    return notFound();
  }

  const storage = mediaStorage();
  if (!storage?.stream) return notFound();
  const headers: Record<string, string> = {
    'Content-Type': spec.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = parseRange(request.headers.get('range'));
  if (range === 'invalid') return new Response(null, { status: 416, headers });
  const stored = await storage.stream(video.key, range ?? undefined);
  if (!stored) return notFound();
  if ('unsatisfiable' in stored) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stored.size}` } });
  headers['Content-Length'] = String(stored.length);
  if (stored.range) headers['Content-Range'] = `bytes ${stored.range.start}-${stored.range.end}/${stored.size}`;
  if (!withBody) await stored.body?.cancel();
  return new Response(withBody ? stored.body : null, { status: stored.range ? 206 : 200, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  return serve(request, id, file, true);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  return serve(request, id, file, false);
}
