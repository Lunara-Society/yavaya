// node render.cjs <firstFrame> <endFrame> <out.mp4>
// Seeks the paused HyperFrames timeline frame by frame (30 fps) and pipes JPEGs into ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const [a, b, out] = [parseInt(process.argv[2]), parseInt(process.argv[3]), process.argv[4]];
const FPS = 30;
(async () => {
  const br = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await br.newPage({ viewport: { width: +(process.env.W||1920), height: +(process.env.H||1080) }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('PAGEERR', String(e)));
  await p.goto('file://' + path.join(__dirname, 'film', 'index.html'), { waitUntil: 'load' });
  for (let i = 0; i < 200 && !(await p.evaluate(() => !!(window.__timelines && window.__timelines.main))); i++) await p.waitForTimeout(100);
  await p.evaluate(() => document.fonts.ready.then(() => 1));
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    await p.evaluate(t => { window.__timelines.main.seek(t, false); return 1; }, f / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - a) % 300 === 0) console.log(`${out}: frame ${f} (${f - a}/${b - a}) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`${out}: done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await br.close();
})();
