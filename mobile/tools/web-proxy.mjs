// Development only: serves the web export and forwards /api/* to the Yavaya
// server, so the browser check sees the same live data a phone would.
//   node tools/web-proxy.mjs dist 8090 https://yavaya.lat
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const [dir = 'dist', port = '8090', upstream = 'https://yavaya.lat'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const r = await fetch(upstream + url.pathname + url.search, { headers: { accept: 'application/json' } }).catch(() => null);
    if (!r) { res.writeHead(502); return res.end(); }
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, safe);
  let body = await readFile(file).catch(() => null);
  if (!body) { file = join(dir, 'index.html'); body = await readFile(file); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(Number(port), () => console.log(`web check on http://localhost:${port} -> ${upstream}`));
