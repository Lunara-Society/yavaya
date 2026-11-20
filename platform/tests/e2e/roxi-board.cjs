/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Barrio's camera button in a real browser: a photo taken on the board's
 * front reaches Roxi with the board named, she answers with
 * prepare_board_post, and the board's form opens filled in with the photo
 * attached; the member publishes it and the photo is on the post. Against
 * the same stand-ins as roxi-flagship.cjs (the agent and the bucket), so
 * nothing costs anything.
 *
 *   node tests/e2e/media-stand-in.cjs 9333 &
 *   ROXI_AGENT_ID=agent_localtest MEDIA_STORAGE_PROVIDER=s3 ... npx next start   (as in roxi-flagship.cjs)
 *   npx tsx --conditions=react-server tests/e2e/roxi-flagship-setup.ts > /tmp/board.json
 *   node tests/e2e/roxi-board.cjs /tmp/board.json
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const setup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};

const POST = {
  district: 'barrio',
  subdistrict: 'utilities',
  kind: 'offer',
  title: 'Corte de agua mañana en la colonia',
  body: 'Avisan que cortan el agua mañana de ocho a doce en toda la colonia. Guarden agua desde hoy.',
  place: 'Nandaime',
};

/** The agent: answers the photo with prepare_board_post, as Roxi does after a board's camera button. */
async function standIn(page) {
  const agent = { received: [], toolResults: [] };
  await page.route(/api\.elevenlabs\.io\/v1\/convai\/conversations\/[^/]+\/files/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ file_id: `file_e2e_${Date.now()}` }) }),
  );
  await page.routeWebSocket(/elevenlabs\.io\/v1\/convai\/conversation/, (ws) => {
    let eventId = 0;
    const send = (event) => ws.send(JSON.stringify(event));
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      agent.received.push(message);
      if (message.type === 'conversation_initiation_client_data') {
        send({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'conv_board', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' } });
        return;
      }
      if (message.type === 'multimodal_message' || message.type === 'user_message') {
        return send({ type: 'client_tool_call', client_tool_call: { tool_name: 'prepare_board_post', tool_call_id: 'call_board_1', parameters: POST } });
      }
      if (message.type === 'client_tool_result') {
        agent.toolResults.push(message);
        send({ type: 'agent_response', agent_response_event: { agent_response: 'Te dejé el aviso listo en el formulario. Revísalo y toca Publicar.', event_id: ++eventId } });
      }
    });
  });
  return agent;
}

async function photoFile(page) {
  const file = path.join(os.tmpdir(), `board-${Date.now()}.png`);
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 700;
    const g = canvas.getContext('2d');
    g.fillStyle = '#d9e4ec';
    g.fillRect(0, 0, 900, 700);
    g.fillStyle = '#1b2a44';
    g.font = 'bold 72px sans-serif';
    g.fillText('CORTE DE AGUA', 120, 300);
    g.font = '48px sans-serif';
    g.fillText('mañana 8:00 – 12:00', 160, 420);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const agent = await standIn(page);
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', setup.email);
  await page.fill('input[name="password"]', setup.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);

  await page.goto(`${BASE}/barrio`, { timeout: 120_000 });
  const button = page.locator('.bd-hero a', { hasText: 'Publicar con una foto' });
  await button.waitFor({ timeout: 30_000 });
  const box = await button.boundingBox();
  check('the camera button is in the first screen on a phone', Boolean(box && box.y + box.height <= 844), box);
  if (shots) await page.screenshot({ path: `${shots}/board-camera-phone.png` });

  // Roxi is on the page: the button opens the camera (a file input), not the form.
  await page.waitForSelector('.roxi', { state: 'attached', timeout: 60_000 });
  const picture = await photoFile(page);
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await button.click();
  await (await chooser).setFiles(picture);

  await page.waitForURL(/\/barrio\/new\?sub=utilities/, { timeout: 60_000 }).catch(() => undefined);
  const sent = agent.received.find((message) => message.type === 'multimodal_message' || message.type === 'user_message');
  // A photo goes as a multimodal message whose text is itself a user message.
  const said = typeof sent?.text === 'object' ? sent.text?.text : sent?.text;
  check('Roxi is told which board the photo is for, with the photo', String(said ?? '').includes('Barrio') && sent?.type === 'multimodal_message', { type: sent?.type, said });
  check('the board form opens on the cuts section', /\/barrio\/new\?sub=utilities/.test(page.url()), page.url());
  await page.locator('.roxi-prefill-note').waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  const form = page.locator('form[action="/api/boards/posts"]');
  const values = {
    kind: await form.locator('select[name="kind"]').inputValue(),
    subdistrict: await form.locator('select[name="subdistrict"]').inputValue(),
    title: await form.locator('input[name="title"]').inputValue(),
    body: await form.locator('textarea[name="body"]').inputValue(),
    photos: await form.locator('input[name="photos"]').evaluate((input) => input.files?.length ?? 0),
    place: await form.locator('.place-picker input[type="text"]').inputValue().catch(() => ''),
  };
  check('the form is filled in with what Roxi wrote', values.kind === 'offer' && values.subdistrict === 'utilities' && values.title === POST.title && values.body === POST.body, values);
  check('the photo is attached to the form', values.photos === 1, values.photos);
  check('the place is the one the member said', values.place === 'Nandaime', values.place);
  check('Roxi is told the form is open with the photo', String(agent.toolResults[0]?.result ?? '').includes('"photos_attached":1'), agent.toolResults[0]?.result);
  if (shots) await page.screenshot({ path: `${shots}/board-form-phone.png`, fullPage: true });

  // The member publishes it themselves.
  await Promise.all([page.waitForURL(/\/barrio\/[0-9a-f-]{36}/, { timeout: 60_000 }).catch(() => undefined), form.locator('button[type="submit"]').click()]);
  check('published by the member, on its own page', /\/barrio\/[0-9a-f-]{36}/.test(page.url()), page.url());
  const photo = page.locator('.bd-photos img').first();
  await photo.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const loaded = await photo.evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  check('the photo is on the published post', loaded);
  if (shots) await page.screenshot({ path: `${shots}/board-post-phone.png`, fullPage: true });

  await browser.close();
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
