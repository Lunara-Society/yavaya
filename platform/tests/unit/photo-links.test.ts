import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEDIA_RULES } from '@/config/business-rules';
import { fetchLinkedImage } from '@/server/domains/media/link';
import { DomainError } from '@/server/errors';
import { isPublicAddress } from '@/server/security/outbound';

/** The message key a link ends in, or 'ok'. */
async function outcome(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return 'ok';
  } catch (error) {
    return error instanceof DomainError ? error.messageKey : String(error);
  }
}

describe('which addresses the server may reach for a member', () => {
  it('allows ordinary internet addresses', () => {
    for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses loopback, private, link-local, metadata, reserved and disguised addresses', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.9.10',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      'fd12:3456::1',
      'fc00::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:10.0.0.1',
      '64:ff9b::7f00:1',
      '2001:db8::1',
      '2002:7f00:1::',
      '2001::1',
      'not-an-address',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});

describe('a photo from a link, under the rules the site runs with', () => {
  it.each([
    ['ftp://example.com/a.jpg', 'media.link.error.invalid'],
    ['file:///etc/passwd', 'media.link.error.invalid'],
    ['javascript:alert(1)', 'media.link.error.invalid'],
    ['data:image/png;base64,AAAA', 'media.link.error.invalid'],
    ['https://user:secret@example.com/a.jpg', 'media.link.error.invalid'],
    ['not a link', 'media.link.error.invalid'],
    ['https://example.com:8443/a.jpg', 'media.link.error.blocked'],
    ['http://127.0.0.1/a.jpg', 'media.link.error.blocked'],
    ['http://0x7f.1/a.jpg', 'media.link.error.blocked'],
    ['http://2130706433/a.jpg', 'media.link.error.blocked'],
    ['http://[::1]/a.jpg', 'media.link.error.blocked'],
    ['http://[::ffff:127.0.0.1]/a.jpg', 'media.link.error.blocked'],
    ['http://169.254.169.254/latest/meta-data/', 'media.link.error.blocked'],
    ['http://10.0.0.1/a.jpg', 'media.link.error.blocked'],
    // A name is checked by what it resolves to: localhost is loopback.
    ['http://localhost/a.jpg', 'media.link.error.blocked'],
  ])('%s is refused (%s)', async (link, expected) => {
    expect(await outcome(fetchLinkedImage(link))).toBe(expected);
  });
});

describe('a photo from a link, fetched', () => {
  let server: http.Server;
  let base = '';
  let png: Buffer;
  // Only this test's own server is reachable, on any port; everything else stays refused.
  const local = { address: (address: string) => address === '127.0.0.1', port: () => true, timeoutMs: 1500 };

  beforeAll(async () => {
    png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#e0a020' } }).png().toBuffer();
    server = http.createServer((request, response) => {
      const path = request.url ?? '/';
      const hop = /^\/hop\/(\d+)$/.exec(path);
      if (hop) {
        const left = Number(hop[1]);
        response.writeHead(302, { location: left === 0 ? '/photo.png' : `/hop/${left - 1}` });
        return response.end();
      }
      switch (path) {
        case '/photo.png':
          response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
          return response.end(png);
        case '/download?id=7':
          // Some hosts say nothing useful about the type; the bytes decide.
          response.writeHead(200, { 'content-type': 'application/octet-stream' });
          return response.end(png);
        case '/page':
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return response.end('<html><img src="/photo.png"></html>');
        case '/text':
          response.writeHead(200, { 'content-type': 'text/plain' });
          return response.end('not a picture');
        case '/corrupt.png':
          response.writeHead(200, { 'content-type': 'image/png' });
          return response.end(Buffer.concat([png.subarray(0, 8), Buffer.from('garbage after a png signature')]));
        case '/declared-huge':
          // The headers go out, the body never does: the size alone must be enough to refuse it.
          response.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': MEDIA_RULES.maxUploadBytes + 1 });
          response.flushHeaders();
          return void setTimeout(() => response.destroy(), 200);
        case '/streamed-huge': {
          response.writeHead(200, { 'content-type': 'image/jpeg' });
          const chunk = Buffer.alloc(256 * 1024, 0xff);
          let sent = 0;
          const pump = () => {
            while (sent <= MEDIA_RULES.maxUploadBytes) {
              sent += chunk.length;
              if (!response.write(chunk)) return response.once('drain', pump);
            }
            response.end();
          };
          response.on('error', () => {});
          return pump();
        }
        case '/to-elsewhere':
          response.writeHead(302, { location: `http://127.0.0.2:${(server.address() as AddressInfo).port}/photo.png` });
          return response.end();
        case '/to-nowhere':
          response.writeHead(302);
          return response.end();
        case '/slow':
          return; // never answers
        default:
          response.writeHead(404);
          return response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('brings in an image, typed by its bytes and named after the link', async () => {
    const image = await fetchLinkedImage(`${base}/photo.png`, local);
    expect(image.contentType).toBe('image/png');
    expect(image.name).toBe('photo.png');
    expect(image.body.equals(png)).toBe(true);
    const untyped = await fetchLinkedImage(`${base}/download?id=7`, local);
    expect(untyped.contentType).toBe('image/png');
    expect(untyped.name).toBe('download.png');
  });

  it('follows a few redirects, and no more', async () => {
    expect((await fetchLinkedImage(`${base}/hop/${MEDIA_RULES.linkMaxRedirects - 1}`, local)).name).toBe('photo.png');
    expect(await outcome(fetchLinkedImage(`${base}/hop/${MEDIA_RULES.linkMaxRedirects}`, local))).toBe('media.link.error.unreachable');
    expect(await outcome(fetchLinkedImage(`${base}/to-nowhere`, local))).toBe('media.link.error.unreachable');
  });

  it('checks every redirect like the first link', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/to-elsewhere`, local))).toBe('media.link.error.blocked');
  });

  it('keeps the address rule even when the port rule is loosened', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/photo.png`, { port: () => true }))).toBe('media.link.error.blocked');
  });

  it('says so when the link is a page, not a photo', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/page`, local))).toBe('media.link.error.page');
  });

  it('refuses what is not an image, or not a readable one', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/text`, local))).toBe('media.error.unsupported_type');
    expect(await outcome(fetchLinkedImage(`${base}/corrupt.png`, local))).toBe('media.error.unreadable');
  });

  it('stops at the upload size limit, declared or not', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/declared-huge`, local))).toBe('media.error.too_large');
    expect(await outcome(fetchLinkedImage(`${base}/streamed-huge`, local))).toBe('media.error.too_large');
  });

  it('gives up on a site that does not answer, or a missing file', async () => {
    expect(await outcome(fetchLinkedImage(`${base}/slow`, local))).toBe('media.link.error.unreachable');
    expect(await outcome(fetchLinkedImage(`${base}/missing.jpg`, local))).toBe('media.link.error.unreachable');
  });
});
