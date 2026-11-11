/**
 * Twenty voice starts in Chromium posing as Android Chrome on a Samsung phone,
 * with a fake microphone, against server.mjs (a stand-in for ElevenLabs that
 * counts the audio it receives). The second run makes the 16 kHz audio path
 * never start, as on the phone that failed on 11 November 2026, and checks the
 * panel's fallback (src/ui/roxi/voice-health.ts) carries the voice anyway.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3412';
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
async function once(browser, broken) {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  const page = await context.newPage();
  await fetch(`${BASE}/reset`);
  await page.goto(BASE);
  if (broken) await page.evaluate(() => window.breakChosenRate());
  await page.evaluate(() => { document.getElementById('go').onclick = () => window.runVoice(); });
  await page.tap('#go');
  // Done when the voice has been heard for a few seconds, or give up at 25 s.
  const started = Date.now();
  let r;
  while (Date.now() - started < 25000) {
    await page.waitForTimeout(1000);
    r = await page.evaluate(() => ({ log: window.vlog }));
    if (r.log.some((e) => e.what === 'healthy')) break;
  }
  const s = await (await fetch(`${BASE}/stats`)).json();
  const spoke = r.log.some((e) => e.what === 'mode' && e.mode === 'speaking');
  const healthy = r.log.find((e) => e.what === 'healthy');
  await context.close();
  return { ok: s.loudChunks > 0 && spoke && !!healthy, heardAfterMs: healthy ? healthy.t : null, sessions: s.sessions, chunks: s.chunks };
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const [name, broken] of [['healthy', false], ['16 kHz path never starts', true]]) {
    const results = [];
    for (let i = 0; i < 20; i++) results.push(await once(browser, broken));
    const ok = results.filter((r) => r.ok).length;
    const times = results.filter((r) => r.heardAfterMs).map((r) => r.heardAfterMs);
    console.log(`${name}: ${ok}/20 voice carried both ways | voice confirmed after ${Math.min(...times)}–${Math.max(...times)} ms | sessions opened per run: ${[...new Set(results.map((r) => r.sessions))].join(',')}`);
  }
  await browser.close();
})();
