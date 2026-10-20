import { brotliCompressSync, gzipSync } from 'node:zlib';
import { GUILLOCHE_VARIANTS, guillocheSvg, type GuillocheVariant } from '@/ui/site/art';

/**
 * The guilloché rosettes as SVG files (see `Guilloche`). Only the named
 * variants exist: the name never becomes a drawing parameter, so a request
 * cannot ask the server to draw something enormous.
 *
 * Compressed here because nothing downstream does it for a route handler's
 * output (checked: the files went out at full size), and these shrink about
 * fourfold. Each is drawn and compressed once per process. Browsers keep
 * them for a week.
 */
type Drawn = { raw: string; br: Buffer; gzip: Buffer };
const drawn = new Map<GuillocheVariant, Drawn>();

function draw(variant: GuillocheVariant): Drawn {
  let entry = drawn.get(variant);
  if (!entry) {
    const raw = guillocheSvg(variant);
    entry = { raw, br: brotliCompressSync(raw), gzip: gzipSync(raw, { level: 9 }) };
    drawn.set(variant, entry);
  }
  return entry;
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const variant = (await params).name.replace(/\.svg$/, '');
  if (!Object.hasOwn(GUILLOCHE_VARIANTS, variant)) return new Response(null, { status: 404 });
  const entry = draw(variant as GuillocheVariant);
  const accepts = request.headers.get('accept-encoding') ?? '';
  const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
  const headers: Record<string, string> = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
    Vary: 'Accept-Encoding',
  };
  if (!encoding) return new Response(entry.raw, { headers });
  return new Response(new Uint8Array(entry[encoding]), { headers: { ...headers, 'Content-Encoding': encoding } });
}
