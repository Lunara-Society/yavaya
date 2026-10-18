import { guideObjectKey } from '@/config/guide';
import { mediaStorage, type ByteRange } from '@/server/domains/media/storage';

export const dynamic = 'force-dynamic';

/**
 * Streams a guide video from the media bucket, in the byte ranges a video
 * player asks for, so a viewer can start at once and skip to any chapter.
 *
 * Only names listed in config/guide.ts are served: this is not a window into
 * the bucket. The version is in the file name, so a file never changes and may
 * be cached for good.
 */
const HEADERS = {
  'Content-Type': 'video/mp4',
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

function parseRange(header: string | null): ByteRange | 'invalid' | null {
  if (!header) return null;
  // One range only: "bytes=START-" or "bytes=START-END". Players never ask for more.
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && end < start) return 'invalid';
  return { start, end };
}

async function serve(request: Request, file: string, withBody: boolean) {
  const key = guideObjectKey(file);
  const storage = mediaStorage();
  if (!key || !storage?.stream) return new Response(null, { status: 404 });

  const range = parseRange(request.headers.get('range'));
  if (range === 'invalid') return new Response(null, { status: 416, headers: HEADERS });

  const stored = await storage.stream(key, range ?? undefined);
  if (!stored) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if ('unsatisfiable' in stored) return new Response(null, { status: 416, headers: { ...HEADERS, 'Content-Range': `bytes */${stored.size}` } });

  const headers: Record<string, string> = { ...HEADERS, 'Content-Length': String(stored.length) };
  if (stored.range) headers['Content-Range'] = `bytes ${stored.range.start}-${stored.range.end}/${stored.size}`;
  if (!withBody) await stored.body?.cancel();
  return new Response(withBody ? stored.body : null, { status: stored.range ? 206 : 200, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  return serve(request, (await params).file, true);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ file: string }> }) {
  return serve(request, (await params).file, false);
}
