/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Mirador's offers in a real browser, on a phone (docs/mirador/README.md,
 * "Offers"): a cook takes two photos of her nacatamales, Yavaya turns them
 * into a video with the end card, she offers ten at C$ 80 with the food
 * rules; a neighbour sees the offer in the feed and asks for two with
 * "Lo quiero"; the cook sets them aside in her studio; the neighbour sees
 * where and when to pick them up, and nothing more than that. Without an
 * ElevenLabs key the voiceover button is absent. Same server and stand-in
 * bucket as tests/e2e/mirador.cjs:
 *
 *   MIRADOR_OPEN=1 npx tsx --conditions=react-server tests/e2e/mirador-setup.ts > /tmp/mirador.json
 *   node tests/e2e/mirador-offers.cjs /tmp/mirador.json
 *
 * `E2E_SHOTS=<dir>` saves the offer form, the feed, the request and the studio.
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
  // Two phone photos, portrait and landscape, the way a cook would take them.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirador-offer-'));
  const photos = [path.join(dir, 'a.jpg'), path.join(dir, 'b.jpg')];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1200x1600', '-frames:v', '1', photos[0]]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'smptebars=size=1600x1200', '-frames:v', '1', photos[1]]);
  const browser = await chromium.launch();

  // --- The cook posts photos with an offer -------------------------------------
  const cook = await signIn(browser, setup.owner.email);
  let page = cook.page;
  await page.goto(`${BASE}/mirador/subir`, { timeout: 120_000 });
  await page.locator('.mu-pick input[type="file"]').setInputFiles(photos);
  await page.locator('.mu-photos img').nth(1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  check('both photos are shown before posting', (await page.locator('.mu-photos img').count()) === 2);
  await page.fill('.mu-field textarea', 'Nacatamales de cerdo, recién salidos #comida');
  await page.fill('[role="combobox"]', 'Mana');
  await page.locator('[role="listbox"] [role="option"]').first().click();
  await page.locator('.mu-kind', { hasText: 'Lo vendo' }).click();
  const offer = page.locator('fieldset.mu-offer');
  await offer.locator('select').first().selectOption('food');
  await offer.locator('label', { hasText: '¿Qué ofreces?' }).locator('input').fill('Nacatamales');
  await offer.locator('label', { hasText: 'Precio' }).locator('input').fill('80');
  await offer.locator('label', { hasText: '¿Cuántos hay?' }).locator('input').fill('10');
  await offer.locator('label', { hasText: 'Por' }).first().locator('input').fill('unidad');
  await offer.locator('label', { hasText: '¿Qué lleva?' }).locator('textarea').fill('Masa de maíz, cerdo, arroz, papa, chile, hoja de plátano');
  await offer.locator('label', { hasText: '¿Dónde y cuándo se recoge?' }).locator('input').fill('Frente a la pulpería La Esquina, de 5 a 7 de la tarde');
  const hours = await offer.locator('label', { hasText: 'Disponible por' }).locator('option').allTextContents();
  check('food is offered for a day at most', !hours.includes('3 días') && hours.includes('1 día'), hours);
  check('the food rules are asked for', (await offer.locator('.mu-rules').count()) === 1);
  await offer.locator('.mu-rules input[type="checkbox"]').check();
  if (shots) await page.screenshot({ path: `${shots}/mirador-offer-form-phone.png`, fullPage: true });
  await page.click('button.mf-cta[type="submit"]');
  await page.locator('.mu-done h2', { hasText: '¡Listo!' }).waitFor({ timeout: 180_000 }).catch(() => undefined);
  check('the photos become a published video', (await page.locator('.mu-done h2', { hasText: '¡Listo!' }).count()) === 1, await page.locator('.mu-error').textContent().catch(() => null));

  // --- A neighbour sees it and asks for two -----------------------------------
  const neighbour = await signIn(browser, setup.member.email);
  page = neighbour.page;
  await page.goto(`${BASE}/mirador`, { timeout: 120_000 });
  const item = page.locator('.mf-item[data-index="0"]');
  await item.waitFor({ timeout: 30_000 }).catch(() => undefined);
  const chip = item.locator('.mf-offer');
  const chipText = (await chip.textContent().catch(() => '')) ?? '';
  check('the feed shows the offer with its price and what is left', /Nacatamales/.test(chipText) && /80/.test(chipText) && /Quedan 10/.test(chipText), chipText);
  const video = await item.locator('video').evaluate((element) => ({ w: element.videoWidth, h: element.videoHeight, duration: element.duration })).catch(() => null);
  check('the photo video is portrait and a few seconds long', video && video.w === 720 && video.h === 1280 && video.duration > 5, video);
  if (shots) await page.screenshot({ path: `${shots}/mirador-offer-feed-phone.png` });
  await chip.locator('.mf-want').click();
  const sheet = page.locator('.mf-sheet');
  await sheet.waitFor({ timeout: 10_000 });
  check('asking shows what it contains and the home-food notice', /Masa de maíz/.test((await sheet.textContent()) ?? '') && (await sheet.locator('.mf-notice').count()) === 1);
  check('it says payment is in person', /Se paga en persona/.test((await sheet.textContent()) ?? ''));
  await sheet.locator('button[aria-label="Uno más"]').click();
  check('the quantity goes up', (await sheet.locator('.mf-qty output').textContent()) === '2');
  await sheet.locator('textarea').fill('Paso a las 5 y media');
  if (shots) await page.screenshot({ path: `${shots}/mirador-offer-want-phone.png` });
  await sheet.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);
  check('the request is sent and the button says so', (await chip.locator('.mf-want').textContent()) === 'Pedido enviado', await chip.locator('.mf-want').textContent());

  // --- The cook sets them aside ------------------------------------------------
  page = cook.page;
  await page.goto(`${BASE}/mirador/estudio#pedidos`, { timeout: 120_000 });
  const incoming = page.locator('.ms-request', { hasText: 'Rosario Prueba' }).first();
  check('the studio shows who asked, how many and their note', /quiere 2 de «Nacatamales»/.test((await incoming.textContent()) ?? '') && /Paso a las 5 y media/.test((await incoming.textContent()) ?? ''), await incoming.textContent());
  check('without an ElevenLabs key there is no voiceover button', (await page.locator('button', { hasText: 'Ponerle la voz de Roxi' }).count()) === 0);
  check('the video row shows its open offer', /Ofreces Nacatamales/.test((await page.locator('.ms-offer-summary').first().textContent().catch(() => '')) ?? ''));
  if (shots) await page.screenshot({ path: `${shots}/mirador-offer-studio-phone.png`, fullPage: true });
  await Promise.all([page.waitForLoadState('load'), incoming.locator('button', { hasText: 'Apartárselo' }).click()]);
  await page.waitForTimeout(1500);
  const accepted = page.locator('.ms-request', { hasText: 'Rosario Prueba' }).first();
  check('accepted, and what is left goes down to 8', /Apartado/.test((await accepted.textContent()) ?? '') && /quedan 8/.test((await accepted.textContent()) ?? ''), await accepted.textContent());

  // --- The neighbour learns where and when -------------------------------------
  page = neighbour.page;
  await page.goto(`${BASE}/mirador/estudio`, { timeout: 120_000 });
  const mine = page.locator('.ms-request').first();
  check('the neighbour sees it set aside with the pickup details', /Apartado/.test((await mine.textContent()) ?? '') && /Frente a la pulpería La Esquina/.test((await mine.textContent()) ?? ''), await mine.textContent());
  if (shots) await page.screenshot({ path: `${shots}/mirador-offer-pickup-phone.png`, fullPage: true });
  await page.goto(`${BASE}/mirador`, { timeout: 120_000 });
  const after = page.locator('.mf-item[data-index="0"] .mf-offer');
  await after.waitFor({ timeout: 30_000 }).catch(() => undefined);
  check('in the feed it now reads “Apartado para ti” and 8 left', /Apartado para ti/.test((await after.textContent()) ?? '') && /Quedan 8/.test((await after.textContent()) ?? ''), await after.textContent());

  // --- Before acceptance, nobody saw the pickup spot ---------------------------
  const stranger = await browser.newContext({ ...devices['Pixel 7'] });
  const anon = await stranger.newPage();
  const html = await (await anon.goto(`${BASE}/mirador`, { timeout: 120_000 }))?.text();
  check('the pickup spot is never in the public page', !(html ?? '').includes('pulpería La Esquina'));

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
