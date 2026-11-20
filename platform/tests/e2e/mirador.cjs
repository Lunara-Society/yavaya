/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Mirador in a real browser, on a phone (docs/mirador/README.md): the owner
 * uploads a portrait phone video in parts, it is encoded by the real
 * pipeline (ffmpeg on this machine), published linked to a listing, and
 * plays in the feed; Mirador is closed to members until the owner opens it
 * in Admin; then a member watches it, likes it, comments, and opens the
 * listing from it. Against the stand-in bucket (media-stand-in.cjs).
 *
 *   node tests/e2e/media-stand-in.cjs 9333 &
 *   MEDIA_STORAGE_PROVIDER=s3 MEDIA_S3_ENDPOINT=http://127.0.0.1:9333 ... npx next start   (as in roxi-flagship.cjs)
 *   npx tsx --conditions=react-server tests/e2e/mirador-setup.ts > /tmp/mirador.json
 *   node tests/e2e/mirador.cjs /tmp/mirador.json
 *
 * `E2E_SHOTS=<dir>` saves the upload, the feed and the comments, on a phone.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const setup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};

async function signIn(browser, email) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', setup.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return { context, page };
}

(async () => {
  // A phone's portrait video: 1080×1920, six seconds, with sound and the place it was filmed.
  const file = path.join(os.tmpdir(), `mirador-${Date.now()}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-metadata', 'location=+12.1364-086.2514/', file]);
  const browser = await chromium.launch();

  // --- The owner, while Mirador is closed -------------------------------------
  const owner = await signIn(browser, setup.owner.email);
  let page = owner.page;
  await page.goto(`${BASE}/`, { timeout: 120_000 });
  check('the owner sees Mirador’s door while it is closed', (await page.locator('a[href="/mirador"]').count()) > 0);

  await page.goto(`${BASE}/mirador/subir`, { timeout: 120_000 });
  await page.locator('.mu-pick input[type="file"]').setInputFiles(file);
  await page.fill('.mu-field textarea', 'Mi Navi lista para rodar #motos #León');
  await page.selectOption('select[name="link"]', `mercadito_listing:${setup.listing}`);
  await page.locator('.mu-status', { hasText: 'Video subido' }).waitFor({ timeout: 120_000 }).catch(() => undefined);
  check('the upload goes up in parts while the caption is written', (await page.locator('.mu-status', { hasText: 'Video subido' }).count()) === 1, await page.locator('.mu-status').textContent().catch(() => ''));
  if (shots) await page.screenshot({ path: `${shots}/mirador-upload-phone.png` });
  const started = Date.now();
  await page.click('button.mf-cta[type="submit"]');
  await page.locator('.mu-done h2', { hasText: '¡Listo!' }).waitFor({ timeout: 180_000 }).catch(() => undefined);
  const seconds = Math.round((Date.now() - started) / 1000);
  check('processed and published on its own after Publicar', (await page.locator('.mu-done h2', { hasText: '¡Listo!' }).count()) === 1, { seconds, error: await page.locator('.mu-error').textContent().catch(() => null) });

  await page.click('.mu-done a.mf-cta');
  await page.waitForURL(/\/mirador\/v\//, { timeout: 60_000 });
  const video = page.locator('.mf-item[data-index="0"] video');
  await video.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('.mf-item[data-index="0"] video');
    return element && element.readyState >= 2 && element.currentTime > 0.3;
  }, null, { timeout: 30_000 }).catch(() => undefined);
  const state = await video.evaluate((element) => ({ ready: element.readyState, time: element.currentTime, muted: element.muted, src: element.currentSrc, w: element.videoWidth, h: element.videoHeight }));
  check('the video plays by itself, muted, in the feed', state.ready >= 2 && state.time > 0.3 && state.muted, state);
  check('it plays the 720p encoding, portrait, never upscaled', state.src.endsWith('/720.mp4') && state.w === 720 && state.h === 1280, state);
  const action = page.locator('.mf-item[data-index="0"] .mf-action');
  check('the listing button shows its price', /Ver anuncio/.test((await action.textContent()) ?? '') && /(C\$|NIO)\s?65[.,]000/.test((await action.textContent()) ?? ''), await action.textContent());
  if (shots) await page.screenshot({ path: `${shots}/mirador-feed-phone.png` });

  // Seeking works: the media route answers byte ranges.
  const range = await page.evaluate(async (src) => {
    const response = await fetch(src, { headers: { range: 'bytes=0-1023' } });
    return { status: response.status, length: (await response.arrayBuffer()).byteLength, contentRange: response.headers.get('content-range') };
  }, state.src);
  check('the media route answers byte ranges', range.status === 206 && range.length === 1024 && /^bytes 0-1023\/\d+$/.test(range.contentRange ?? ''), range);

  // --- A member, while it is closed -------------------------------------------
  const member = await signIn(browser, setup.member.email);
  const closed = await member.page.goto(`${BASE}/mirador`, { timeout: 120_000 });
  check('a member cannot open Mirador while it is closed', closed?.status() === 404, closed?.status());
  const mediaClosed = await member.page.evaluate(async (src) => (await fetch(src)).status, state.src.replace(/^https?:\/\/[^/]+/, ''));
  check('nor fetch its videos', mediaClosed === 404, mediaClosed);

  // --- The owner opens it from Admin ------------------------------------------
  await page.goto(`${BASE}/admin`, { timeout: 120_000 });
  const open = page.locator('form', { has: page.locator('button', { hasText: 'Abrir Mirador a todos' }) }).first();
  await Promise.all([page.waitForLoadState('networkidle').catch(() => undefined), open.locator('button').click()]);
  await page.waitForTimeout(1500);

  // --- The member watches, likes, comments, and opens the listing --------------
  page = member.page;
  await page.goto(`${BASE}/`, { timeout: 120_000 });
  check('once open, the member has the door in the bottom bar', (await page.locator('.dock a[href="/mirador"]').count()) === 1);
  await page.goto(`${BASE}/mirador`, { timeout: 120_000 });
  const item = page.locator('.mf-item[data-index="0"]');
  await item.waitFor({ timeout: 30_000 }).catch(() => undefined);
  check('once open, the member’s Para ti has the video', (await item.count()) === 1 && /Mi Navi/.test((await item.textContent()) ?? ''));
  const like = item.locator('button[aria-label="Me gusta"]');
  await like.click();
  await page.waitForTimeout(800);
  check('a like counts once', (await item.locator('button[aria-pressed="true"]').first().textContent())?.trim() === '1', await item.locator('.mf-rail .mf-btn').first().textContent());
  await item.locator('button[aria-label="Comentarios"]').click();
  await page.fill('.mf-compose input', '¡Qué buena moto!');
  await page.click('.mf-compose button[type="submit"]');
  await page.locator('.mf-comment', { hasText: '¡Qué buena moto!' }).waitFor({ timeout: 15_000 }).catch(() => undefined);
  check('a comment appears under the video', (await page.locator('.mf-comment', { hasText: '¡Qué buena moto!' }).count()) === 1);
  if (shots) await page.screenshot({ path: `${shots}/mirador-comments-phone.png` });
  await page.click('.mf-sheet header button');
  await Promise.all([page.waitForURL(new RegExp(`/mercadito/${setup.listing}`), { timeout: 60_000 }).catch(() => undefined), item.locator('.mf-action').click()]);
  check('the listing button opens the listing itself', page.url().includes(`/mercadito/${setup.listing}`), page.url());

  // The creator's studio shows the real numbers.
  page = owner.page;
  await page.goto(`${BASE}/mirador/estudio`, { timeout: 120_000 });
  const numbers = await page.locator('.ms-row .ms-numbers').first().textContent();
  check('the studio counts the member’s like, comment and tap, nothing invented', /1 me gusta/.test(numbers ?? '') && /1 comentarios/.test(numbers ?? '') && /1 clics/.test(numbers ?? ''), numbers);

  // Reduced motion: nothing starts by itself.
  const still = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
  const quiet = await still.newPage();
  await quiet.goto(`${BASE}/mirador`, { timeout: 120_000 });
  await quiet.waitForTimeout(2500);
  const paused = await quiet.locator('.mf-item[data-index="0"] video').evaluate((element) => element.paused).catch(() => null);
  check('with reduced motion asked for, the video waits for a tap', paused === true && (await quiet.locator('.mf-play').count()) === 1, paused);

  // Close it again, as it was.
  await page.goto(`${BASE}/admin`, { timeout: 120_000 });
  await page.locator('form', { has: page.locator('button', { hasText: 'Cerrar Mirador' }) }).first().locator('button').click();
  await page.waitForTimeout(1000);

  await browser.close();
  fs.rmSync(file, { force: true });
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
