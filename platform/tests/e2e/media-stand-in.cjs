/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * A bucket for browser tests that store real photos and videos
 * (roxi-flagship.cjs, mirador.cjs): the S3 calls the media service makes
 * (put, get with byte ranges, delete an object, and multipart uploads, path
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
/** Multipart uploads in progress: uploadId → { key, type, parts: Map<partNumber, Buffer> }. */
const uploads = new Map();
let uploadCounter = 0;

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
    const url = new URL(request.url, 'http://x');
    const key = decodeURIComponent(url.pathname);
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = () => {
        const raw = Buffer.concat(chunks);
        const chunked = String(request.headers['content-encoding'] ?? '').includes('aws-chunked') || String(request.headers['x-amz-content-sha256'] ?? '').startsWith('STREAMING');
        return chunked ? unchunk(raw) : raw;
      };
      const uploadId = url.searchParams.get('uploadId');
      // Multipart: start, parts, complete, abort.
      if (request.method === 'POST' && url.searchParams.has('uploads')) {
        const id = `up-${++uploadCounter}`;
        uploads.set(id, { key, type: request.headers['content-type'] ?? 'application/octet-stream', parts: new Map() });
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        return response.end(`<?xml version="1.0"?><InitiateMultipartUploadResult><Bucket>e2e</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (request.method === 'PUT' && uploadId) {
        const upload = uploads.get(uploadId);
        if (!upload) {
          response.writeHead(404, { 'Content-Type': 'application/xml' });
          return response.end('<?xml version="1.0"?><Error><Code>NoSuchUpload</Code><Message>missing</Message></Error>');
        }
        const n = Number(url.searchParams.get('partNumber'));
        upload.parts.set(n, body());
        response.writeHead(200, { ETag: `"part-${n}"` });
        return response.end();
      }
      if (request.method === 'POST' && uploadId) {
        const upload = uploads.get(uploadId);
        if (!upload) {
          response.writeHead(404, { 'Content-Type': 'application/xml' });
          return response.end('<?xml version="1.0"?><Error><Code>NoSuchUpload</Code><Message>missing</Message></Error>');
        }
        const numbers = [...upload.parts.keys()].sort((a, b) => a - b);
        objects.set(upload.key, { body: Buffer.concat(numbers.map((n) => upload.parts.get(n))), type: upload.type });
        uploads.delete(uploadId);
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        return response.end(`<?xml version="1.0"?><CompleteMultipartUploadResult><Bucket>e2e</Bucket><Key>${key}</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`);
      }
      if (request.method === 'DELETE' && uploadId) {
        uploads.delete(uploadId);
        response.writeHead(204);
        return response.end();
      }
      if (request.method === 'PUT') {
        objects.set(key, { body: body(), type: request.headers['content-type'] ?? 'application/octet-stream' });
        response.writeHead(200, { ETag: '"e2e"' });
        return response.end();
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        const found = objects.get(key);
        if (!found) {
          response.writeHead(404, { 'Content-Type': 'application/xml' });
          return response.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        }
        // One byte range, as a video player asks for.
        const range = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? ''));
        if (range) {
          const size = found.body.length;
          const start = Number(range[1]);
          if (start >= size) {
            response.writeHead(416, { 'Content-Range': `bytes */${size}` });
            return response.end();
          }
          const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
          response.writeHead(206, { 'Content-Type': found.type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
          return response.end(request.method === 'HEAD' ? undefined : found.body.subarray(start, end + 1));
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
