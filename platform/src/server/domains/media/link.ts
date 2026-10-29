import 'server-only';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { MEDIA_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { BlockedAddressError, guardedLookup, isPublicAddress } from '@/server/security/outbound';
import { sniffImageType, type SniffedType } from './image';

/**
 * A photo brought in from a link a member pasted.
 *
 * The server makes the download, so it is guarded like any request a
 * stranger can aim (see `security/outbound.ts`): http or https on their
 * usual ports only, no credentials in the link, public addresses only,
 * checked again on every redirect, a deadline for the whole chain and a cap
 * on the bytes read. What comes back is not trusted either: it must be a
 * JPEG, PNG or WebP by its own first bytes, and readable. The member then
 * sends it with their form like any photo from their phone, and the upload
 * pipeline checks and re-encodes it again.
 */

export type LinkedImage = { body: Buffer; contentType: SniffedType; name: string };

type Guard = {
  address: (address: string) => boolean;
  port: (port: string) => boolean;
  timeoutMs: number;
};

const STRICT: Guard = {
  address: isPublicAddress,
  // An empty port is the scheme's own (443, 80): no reaching other services on a public host.
  port: (port) => port === '',
  timeoutMs: MEDIA_RULES.linkTimeoutSeconds * 1000,
};

const EXTENSION: Record<SniffedType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const USER_AGENT = 'YavayaPhotoLink/1.0 (+https://yavaya.lat)';
const MAX_LINK_LENGTH = 2048;

const invalid = () => errors.validation('media.link.error.invalid');
// Which rule refused the address is not said: it would only help someone probe.
const blocked = () => errors.validation('media.link.error.blocked');
const unreachable = () => errors.validation('media.link.error.unreachable');
const tooLarge = () => errors.validation('media.error.too_large', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 });

/**
 * Downloads the image a link points to.
 *
 * `guard` loosens the network rules for tests against a local server;
 * nothing else passes it.
 */
export async function fetchLinkedImage(raw: string, guard: Partial<Guard> = {}): Promise<LinkedImage> {
  const rules = { ...STRICT, ...guard };
  const deadline = Date.now() + rules.timeoutMs;
  let url = checkLink(raw, rules);
  for (let hop = 0; ; hop += 1) {
    const answer = await download(url, rules, deadline);
    if ('image' in answer) return readable(answer.image);
    if (hop >= MEDIA_RULES.linkMaxRedirects) throw unreachable();
    let next: string;
    try {
      next = new URL(answer.redirect, url).toString();
    } catch {
      throw unreachable();
    }
    url = checkLink(next, rules);
  }
}

function checkLink(raw: string, rules: Guard): URL {
  const text = raw.trim();
  if (!text || text.length > MAX_LINK_LENGTH) throw invalid();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalid();
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname) throw invalid();
  if (!rules.port(url.port)) throw blocked();
  // A literal address never goes through a DNS lookup, so it is checked here.
  // The URL parser has already turned 0x7f.1 or 2130706433 into 127.0.0.1.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) && !rules.address(host)) throw blocked();
  return url;
}

function download(url: URL, rules: Guard, deadline: number): Promise<{ redirect: string } | { image: LinkedImage }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(unreachable());
    let settled = false;
    const finish = (outcome: { redirect: string } | { image: LinkedImage } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outcome instanceof Error) {
        request.destroy();
        reject(outcome);
      } else {
        resolve(outcome);
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: guardedLookup(rules.address),
        // A fresh connection each time: a pooled one, opened for another host, is never reused.
        agent: false,
        headers: { accept: 'image/jpeg,image/png,image/webp;q=0.9,image/*;q=0.5', 'user-agent': USER_AGENT },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          const location = response.headers.location;
          return finish(location ? { redirect: location } : unreachable());
        }
        if (status !== 200) {
          response.resume();
          return finish(unreachable());
        }
        const type = String(response.headers['content-type'] ?? '').toLowerCase();
        // The usual mistake: the link to the page the photo is on, not to the photo.
        if (type.startsWith('text/html') || type.startsWith('application/xhtml')) return finish(errors.validation('media.link.error.page'));
        if (Number(response.headers['content-length'] ?? 0) > MEDIA_RULES.maxUploadBytes) return finish(tooLarge());

        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MEDIA_RULES.maxUploadBytes) return finish(tooLarge());
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks);
          const sniffed = sniffImageType(body);
          if (!sniffed) return finish(errors.validation('media.error.unsupported_type'));
          finish({ image: { body, contentType: sniffed, name: fileName(url, sniffed) } });
        });
        response.on('error', () => finish(unreachable()));
      },
    );
    request.on('error', (error) => finish(error instanceof BlockedAddressError ? blocked() : unreachable()));
    const timer = setTimeout(() => finish(unreachable()), remaining);
  });
}

/** The decoder has to be able to read it, within the same pixel limit as an upload. */
async function readable(image: LinkedImage): Promise<LinkedImage> {
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(image.body, { limitInputPixels: MEDIA_RULES.maxInputPixels, failOn: 'error' }).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > MEDIA_RULES.maxInputPixels) throw new Error('unreadable');
  } catch {
    throw errors.validation('media.error.unreadable');
  }
  return image;
}

/** A tidy file name from the link's last path segment, with the extension the bytes deserve. */
function fileName(url: URL, type: SniffedType): string {
  let last = url.pathname.split('/').pop() ?? '';
  try {
    last = decodeURIComponent(last);
  } catch {
    // Kept as it was.
  }
  const stem = last
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'foto'}.${EXTENSION[type]}`;
}
