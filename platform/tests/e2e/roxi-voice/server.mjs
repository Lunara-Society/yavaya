import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
const vendor = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../public/vendor/elevenlabs');
const here = path.dirname(new URL(import.meta.url).pathname);
const stats = { sessions: 0, chunks: 0, loudChunks: 0, maxRms: 0, firstChunkMs: null, openedAt: 0, agentAudioSent: 0 };
// One second of a 440 Hz tone, PCM16 at 16 kHz: what "Roxi speaking" sends.
function tone() {
  const n = 16000, buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 8000), i * 2);
  return buf.toString('base64');
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/stats') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(stats)); }
  if (url.pathname === '/reset') { Object.assign(stats, { sessions: 0, chunks: 0, loudChunks: 0, maxRms: 0, firstChunkMs: null, openedAt: 0, agentAudioSent: 0 }); return res.end('ok'); }
  let file = url.pathname === '/' ? path.join(here, 'index.html') : url.pathname.startsWith('/vendor/elevenlabs/') ? path.join(vendor, path.basename(url.pathname)) : path.join(here, path.basename(url.pathname));
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
const wss = new WebSocketServer({ server, path: '/ws', handleProtocols: (p) => (p.has('convai') ? 'convai' : false) });
wss.on('connection', (socket) => {
  stats.sessions += 1; stats.openedAt = Date.now();
  socket.on('message', (raw) => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === 'conversation_initiation_client_data') {
      socket.send(JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'conv_lab', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' } }));
      setTimeout(() => { socket.send(JSON.stringify({ type: 'audio', audio_event: { audio_base_64: tone(), event_id: 1 } })); stats.agentAudioSent += 1; }, 400);
    } else if (m.user_audio_chunk) {
      const pcm = Buffer.from(m.user_audio_chunk, 'base64');
      let sum = 0; const n = pcm.length / 2;
      for (let i = 0; i < n; i++) { const s = pcm.readInt16LE(i * 2); sum += s * s; }
      const rms = Math.sqrt(sum / Math.max(1, n));
      stats.chunks += 1; if (rms > 50) stats.loudChunks += 1; stats.maxRms = Math.max(stats.maxRms, Math.round(rms));
      if (stats.firstChunkMs === null) stats.firstChunkMs = Date.now() - stats.openedAt;
    }
  });
});
server.listen(Number(process.argv[2] || 3412), () => console.log('lab up'));
