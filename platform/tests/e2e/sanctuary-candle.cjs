/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * "Encender una vela por alguien" in a real browser, on a phone (docs/sanctuary/CANDLE.md): from the prayer wall
 * to the lighting page; the day's prayer above the unlit candle; lit for "Mamá" — the film plays and runs into the
 * burning loop; sent through the phone's share sheet (the link, and the film as a file); opened by someone without
 * an account, where it lights itself and says who lit it and for whom; its preview card; reported, its words hidden.
 *
 *   npx tsx --conditions=react-server tests/e2e/candle-setup.ts > /tmp/candle.json
 *   node tests/e2e/sanctuary-candle.cjs /tmp/candle.json
 *
 * Headless Chromium has no share sheet, so the page's call to it is recorded instead (what the person's phone
 * would be handed). `E2E_SHOTS=<dir>` saves the lighting page, the lit candle and the page it is sent to.
 */
const fs = require('node:fs');
const { chromium, devices } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const setup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};

// What the phone's share sheet would receive.
const shareSheet = () => {
  window.__shared = [];
  navigator.share = async (data) => {
    window.__shared.push({ title: data.title, text: data.text, url: data.url, files: (data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
  };
  navigator.canShare = () => true;
};

(async () => {
  const browser = await chromium.launch();

  // --- A visitor first: the card on the prayer wall, and the candle without the form ---
  const visitor = await browser.newContext({ ...devices['Pixel 7'] });
  let page = await visitor.newPage();
  await page.goto(`${BASE}/sanctuary/prayer`, { timeout: 120_000 });
  check('the prayer wall has the candle card', (await page.locator('a.vela-card').count()) === 1, await page.locator('a.vela-card strong').textContent().catch(() => null));
  await Promise.all([page.waitForURL(/\/sanctuary\/vela$/), page.locator('a.vela-card').click()]);
  check('a visitor sees the candle and is asked to sign in to light one', (await page.locator('.vela-stage').count()) === 1 && (await page.locator('.vela-form input').count()) === 0 && (await page.locator('a.vela-light').count()) === 1);

  // --- The member lights a candle for her mother ---
  const member = await browser.newContext({ ...devices['Pixel 7'] });
  await member.addInitScript(shareSheet);
  page = await member.newPage();
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', setup.member.email);
  await page.fill('input[name="password"]', setup.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  await page.goto(`${BASE}/sanctuary/vela`, { timeout: 120_000 });
  const prayer = (await page.locator('.vela-prayer blockquote').textContent())?.trim() ?? '';
  check('the day’s prayer is above the candle', prayer.length > 20 && (await page.locator('.vela-eyebrow').textContent()) === 'La oración de hoy', prayer);
  const box = await page.locator('.vela-prayer').boundingBox();
  const stage = await page.locator('.vela-stage').boundingBox();
  check('the prayer sits in the dark above the flame', box && stage && box.y + box.height < stage.y + stage.height * 0.42, { box, stage });
  await page.fill('.vela-field >> nth=0 >> input', 'Mamá');
  await page.fill('.vela-field >> nth=1 >> input', 'Por su salud');
  if (shots) await page.screenshot({ path: `${shots}/candle-before-phone.png` });
  await page.click('button.vela-light');
  await page.waitForTimeout(1700);
  if (shots) await page.screenshot({ path: `${shots}/candle-lighting-phone.png` });
  await page.locator('.vela-sent h2').waitFor({ timeout: 20_000 }).catch(() => undefined);
  check('the candle lights and says so', (await page.locator('.vela-sent h2').textContent()) === 'Tu vela está encendida');
  check('beneath the flame: for whom, and the button to send it, in view', (await page.locator('.vela-below .vela-for').textContent()) === 'Por Mamá' && (await page.locator('.vela-below .vela-send').isVisible()));
  const seen = await page.locator('.vela-stage').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5; });
  check('the candle stayed in view while it lit', seen);
  await page.waitForTimeout(1500);
  const loop = await page.locator('video.vela-film[loop]').evaluate((v) => ({ playing: !v.paused, time: v.currentTime, src: v.currentSrc, w: v.videoWidth, h: v.videoHeight })).catch(() => null);
  check('then it burns: the loop plays', loop && loop.playing && loop.time > 0.3 && loop.src.endsWith('/velas/arde.mp4') && loop.w === 720 && loop.h === 1280, loop);
  if (shots) await page.screenshot({ path: `${shots}/candle-lit-phone.png` });

  await page.click('.vela-below .vela-send');
  await page.click('.vela-actions button.vela-line >> nth=0');
  await page.waitForTimeout(2500);
  const shared = await page.evaluate(() => window.__shared);
  const link = shared?.[0]?.url ?? '';
  check('“Enviársela” opens the share sheet with the candle’s link and the words', /\/sanctuary\/vela\/[0-9a-f-]{36}$/.test(link) && /^Mamá, encendí una vela por ti/.test(shared[0].text), shared?.[0]);
  check('“Enviar el video” hands over the film itself, with the link in the words', shared?.[1]?.files?.[0]?.type === 'video/mp4' && shared[1].files[0].size > 100_000 && shared[1].text.includes(link), shared?.[1]);

  // --- Whoever it was sent to, without an account ---
  page = await visitor.newPage();
  const res = await page.goto(link, { timeout: 120_000 });
  check('the candle’s page opens without an account', res?.status() === 200);
  check('it shows the same prayer, of the day it was lit', ((await page.locator('.vela-prayer blockquote').textContent()) ?? '').trim() === prayer);
  await page.locator('.vela-after').waitFor({ timeout: 20_000 }).catch(() => undefined);
  const lead = (await page.locator('.vela-below').textContent()) ?? '';
  const words = (await page.locator('.vela-after').textContent()) ?? '';
  check('it lights itself, then says on the candle who lit it and for whom', /Rosa Prueba encendió esta vela por ti/.test(lead) && /Por Mamá/.test(lead), lead);
  check('and beneath it, why and until when', /Por su salud/.test(words) && /Arde hasta el/.test(words), words);
  if (shots) await page.screenshot({ path: `${shots}/candle-received-phone.png` });
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const image = og ? await page.request.get(og) : null;
  check('its preview card is its own image', image?.status() === 200 && image.headers()['content-type'] === 'image/png', { og, status: image?.status() });
  if (shots && image) fs.writeFileSync(`${shots}/candle-preview.png`, await image.body());

  page.on('dialog', (dialog) => void dialog.accept());
  await page.click('.vela-small button.vela-link');
  await page.waitForTimeout(2500);
  await page.reload();
  await page.locator('.vela-after').waitFor({ timeout: 20_000 }).catch(() => undefined);
  const after = (await page.locator('.vela').textContent()) ?? '';
  check('reported: its words are hidden at once, the candle still burns', /se ocultó/.test(after) && !/Mamá/.test(after) && !/Rosa Prueba/.test(after) && /Arde hasta el/.test(after), after);

  // --- Reduced motion: the lit candle, still ---
  const still = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
  const quiet = await still.newPage();
  await quiet.goto(link, { timeout: 120_000 });
  await quiet.waitForTimeout(1500);
  check('with reduced motion, the lit candle is a still image', (await quiet.locator('img.vela-film').count()) === 1 && (await quiet.locator('video[loop]').count()) === 0);

  await browser.close();
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
