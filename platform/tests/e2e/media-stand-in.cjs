/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * A bucket for browser tests that store real photos (roxi-flagship.cjs): the
 * few S3 calls the media service makes (put, get, delete an object, path
 * style), kept in memory. Signatures are not checked; nothing leaves this
 * machine. Local tests only.
 *
 *   node tests/e2e/media-stand-in.cjs 9333
 *   MEDIA_STORAGE_PROVIDER=s3 MEDIA_S3_ENDPOINT=http://127.0.0.1:9333 MEDIA_S3_BUCKET=e2e \
 *   MEDIA_S3_ACCESS_KEY_ID=e2e MEDIA_S3_SECRET_ACCESS_KEY=e2e MEDIA_S3_FORCE_PATH_STYLE=true npx next start
 */
const http = require('node:http');

const port = Number(process.argv[2] ?? 9333);
const objects = new Map();

/** The SDK may send a body as aws-chunked: "<hex size>;chunk-signature=…\r\n<bytes>\r\n", ending at size 0. */
function unchunk(buffer) {
  const parts = [];
  let at = 0;
  for (;;) {
    const end = buffer.indexOf('\r\n', at);
    if (end < 0) break;
    const size = parseInt(buffer.subarray(at, end).toString().split(';')[0], 16);
    if (!size) break;
    parts.push(buffer.subarray(end + 2, end + 2 + size));
    at = end + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

http
  .createServer((request, response) => {
    const key = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (request.method === 'PUT') {
        const body = Buffer.concat(chunks);
        const chunked = String(request.headers['content-encoding'] ?? '').includes('aws-chunked') || String(request.headers['x-amz-content-sha256'] ?? '').startsWith('STREAMING');
        objects.set(key, { body: chunked ? unchunk(body) : body, type: request.headers['content-type'] ?? 'application/octet-stream' });
        response.writeHead(200, { ETag: '"e2e"' });
        return response.end();
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        const found = objects.get(key);
        if (!found) {
          response.writeHead(404, { 'Content-Type': 'application/xml' });
          return response.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        }
        response.writeHead(200, { 'Content-Type': found.type, 'Content-Length': found.body.length });
        return response.end(request.method === 'HEAD' ? undefined : found.body);
      }
      if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204);
        return response.end();
      }
      response.writeHead(405);
      response.end();
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`media stand-in on ${port}`));
