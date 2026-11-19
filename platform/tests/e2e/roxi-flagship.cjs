/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Roxi's listing flagship in a real browser (docs/roxi/FLAGSHIP.md), from a
 * photo to a published listing and its receipt, against the same stand-in
 * for the agent as roxi-panel.cjs and a stand-in bucket (media-stand-in.cjs),
 * so photos are really stored and served, and no conversation costs anything.
 *
 *   node tests/e2e/media-stand-in.cjs 9333 &
 *   ROXI_AGENT_ID=agent_localtest MEDIA_STORAGE_PROVIDER=s3 MEDIA_S3_ENDPOINT=http://127.0.0.1:9333 MEDIA_S3_BUCKET=e2e \
 *     MEDIA_S3_ACCESS_KEY_ID=e2e MEDIA_S3_SECRET_ACCESS_KEY=e2e MEDIA_S3_FORCE_PATH_STYLE=true npx next start
 *   npx tsx --conditions=react-server tests/e2e/roxi-flagship-setup.ts > /tmp/flagship.json
 *   node tests/e2e/roxi-flagship.cjs /tmp/flagship.json
 *
 * `E2E_SHOTS=<dir>` saves the card, the form and the receipt, desktop and phone.
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

/** The agent: answers a photo with prepare_listing, as Roxi does when someone wants to sell. */
async function standIn(page) {
  const agent = { sockets: 0, received: [], toolResults: [] };
  // The SDK uploads a photo over HTTPS before naming it in the conversation.
  await page.route(/api\.elevenlabs\.io\/v1\/convai\/conversations\/[^/]+\/files/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ file_id: `file_e2e_${Date.now()}` }) }),
  );
  await page.routeWebSocket(/elevenlabs\.io\/v1\/convai\/conversation/, (ws) => {
    agent.sockets++;
    let eventId = 0;
    const send = (event) => ws.send(JSON.stringify(event));
    const say = (text) => send({ type: 'agent_response', agent_response_event: { agent_response: text, event_id: ++eventId } });
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      agent.received.push(message);
      if (message.type === 'conversation_initiation_client_data') {
        send({
          type: 'conversation_initiation_metadata',
          conversation_initiation_metadata_event: { conversation_id: `conv_flagship_${agent.sockets}`, agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' },
        });
        return;
      }
      if (message.type === 'multimodal_message' || message.type === 'user_message') {
        return send({
          type: 'client_tool_call',
          client_tool_call: {
            tool_name: 'prepare_listing',
            tool_call_id: `call_flagship_${agent.received.length}`,
            parameters: { title: 'Bicicleta de montaña usada, talla M', description: 'Bicicleta de montaña usada, talla M, con frenos de disco.', category: 'sports', condition: 'used', price: '3500', place: 'Nandaime' },
          },
        });
      }
      if (message.type === 'client_tool_result') {
        agent.toolResults.push(message);
        say('Listo: te dejé el anuncio en una tarjeta para revisarlo.');
      }
    });
  });
  return agent;
}

async function signIn(context) {
  const page = await context.newPage();
  const agent = await standIn(page);
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', setup.email);
  await page.fill('input[name="password"]', setup.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return { page, agent };
}

async function openPanel(page) {
  await page.locator('.roxi-launch').click({ timeout: 60_000 });
  await page.locator('.roxi-panel').waitFor({ timeout: 60_000 });
}

/** A photo of something to sell: big enough and sharp enough that the photo coach says nothing. */
async function photoFile(page) {
  const file = path.join(os.tmpdir(), `flagship-${Date.now()}.png`);
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 700;
    const g = canvas.getContext('2d');
    g.fillStyle = '#e8e2d4';
    g.fillRect(0, 0, 900, 700);
    g.strokeStyle = '#1b2a44';
    g.lineWidth = 14;
    for (const x of [250, 650]) {
      g.beginPath();
      g.arc(x, 470, 130, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(250, 470);
    g.lineTo(420, 260);
    g.lineTo(650, 470);
    g.lineTo(460, 470);
    g.lineTo(250, 470);
    g.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const { page, agent } = await signIn(context);
  await openPanel(page);

  // 1. A photo to Roxi: she prepares the listing, and it comes back as a card to review — nothing opens.
  const picture = await photoFile(page);
  await page.locator('.roxi-panel input[type="file"]:not([capture])').setInputFiles(picture);
  await page.locator('.roxi-review-card').waitFor({ timeout: 60_000 }).catch(() => undefined);
  // The card appears as the draft is saved; the tool's answer reaches the agent a moment later.
  for (let i = 0; i < 50 && agent.toolResults.length === 0; i++) await page.waitForTimeout(200);
  const result = String(agent.toolResults[0]?.result ?? '');
  check('the tool answers with the review card, not an open form', result.includes('"shown":"review_card"') && result.includes('"photos_attached":1'), result.slice(0, 240));
  check('the tool says nothing is published', result.includes('Nothing is published yet'));
  check('the card is in the panel and the page has not moved', (await page.locator('.roxi-review-card').count()) === 1 && !page.url().includes('/mercadito/publish'), page.url());
  check('the card shows the title Roxi wrote', (await page.locator('.roxi-review-field input').first().inputValue()) === 'Bicicleta de montaña usada, talla M');
  check('the card shows the place found among Yavaya\'s towns', ((await page.locator('.roxi-review-field p').first().textContent()) ?? '').startsWith('Nandaime'));
  const photoUrl = await page.locator('.roxi-review-photos img').first().getAttribute('src');
  const loaded = await page.locator('.roxi-review-photos img').first().evaluate((img) => img.complete && img.naturalWidth > 0);
  check('the photo is kept on the server and shown to its owner', Boolean(photoUrl?.startsWith('/api/roxi/drafts/photo/')) && loaded, photoUrl);
  if (shots) await page.screenshot({ path: `${shots}/flagship-card-desktop.png`, animations: 'disabled' });

  // 2. The photo is the member's alone until published.
  const stranger = await browser.newContext();
  const outside = await stranger.request.get(`${BASE}${photoUrl}`);
  const mediaId = photoUrl.split('/').pop();
  const publicRoute = await stranger.request.get(`${BASE}/media/${mediaId}`);
  check('signed out, the draft photo is not served', outside.status() === 404, outside.status());
  check('the public media route does not serve it either', publicRoute.status() === 404, publicRoute.status());
  await stranger.close();

  // 3. On another device: the draft is waiting there too.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page: phone } = await signIn(other);
  await openPanel(phone);
  await phone.locator('.roxi-review-card').waitFor({ timeout: 30_000 }).catch(() => undefined);
  check('another device: the card is waiting in the panel', (await phone.locator('.roxi-review-card').count()) === 1);
  if (shots) await phone.screenshot({ path: `${shots}/flagship-card-phone.png`, animations: 'disabled' });
  await other.close();

  // 4. The member changes the price on the card, then opens the form: filled in from the draft, photo included.
  await page.locator('.roxi-review-price input').fill('3200');
  await page.locator('.roxi-review .roxi-retry', { hasText: 'Revisar y publicar' }).click();
  await page.waitForURL(/\/mercadito\/publish\?draft=/, { timeout: 60_000 }).catch(() => undefined);
  const draftId = new URL(page.url()).searchParams.get('draft');
  await page.locator('form.mk-form input[name="title"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  check('the form opens from the draft', Boolean(draftId), page.url());
  check('the form has the title', (await page.inputValue('form.mk-form input[name="title"]')) === 'Bicicleta de montaña usada, talla M');
  check('the form has the price changed on the card', (await page.inputValue('form.mk-form input[name="price"]')) === '3200');
  check('the form has the place', (await page.locator('.place-picker input[type="text"]').inputValue()) === 'Nandaime');
  const formPhoto = await page.locator('.mk-photos img').first().getAttribute('src').catch(() => null);
  check('the form shows the draft photo without uploading it again', formPhoto === photoUrl, formPhoto);
  check('the form says Roxi prepared it and the member publishes it', (await page.locator('.roxi-prefill-note').textContent())?.includes('publícalo tú'));
  check('the card points to the open form instead of taking edits it would not see', (await page.locator('.roxi-review-in-form').count()) === 1 && (await page.locator('.roxi-review-card input').count()) === 0);
  if (shots) await page.screenshot({ path: `${shots}/flagship-form-desktop.png`, animations: 'disabled' });

  // 5. Publishing: the listing has the draft's id, and the receipt says what it came to.
  await page.locator('form.mk-form:has(input[name="title"]) button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === `/mercadito/${draftId}`, { timeout: 60_000 }).catch(() => undefined);
  check('published under the draft\'s id', new URL(page.url()).pathname === `/mercadito/${draftId}`, page.url());
  await page.locator('.roxi-receipt').waitFor({ timeout: 30_000 }).catch(() => undefined);
  const receipt = (await page.locator('.roxi-receipt').textContent().catch(() => '')) ?? '';
  check('the receipt is shown', receipt.includes('Publicado') && receipt.includes('Bicicleta de montaña usada, talla M'), receipt);
  check('the receipt says it was free and how many free remain', /Gratis\. Anuncios abiertos gratis que te quedan: \d+/.test(receipt), receipt);
  check('the receipt says how to change it and take it down', receipt.includes('Editar') && receipt.includes('Retirar publicación'));
  const listingPhoto = await page.locator(`img[src="/media/${mediaId}"]`).count();
  check('the photo is now the listing\'s, on the public route', listingPhoto > 0, listingPhoto);
  await page.waitForTimeout(1000);
  const told = agent.received.filter((message) => message.type === 'contextual_update').map((message) => message.text).find((text) => String(text).includes('just published'));
  check('Roxi is told the receipt\'s facts', Boolean(told) && told.includes(`/mercadito/${draftId}`) && told.includes('free'), told);
  if (shots) await page.screenshot({ path: `${shots}/flagship-receipt-desktop.png`, animations: 'disabled' });

  // 6. The same draft again (a second tab, the back button): it is gone, and nothing publishes twice.
  await page.goto(`${BASE}/mercadito/publish?draft=${draftId}`, { timeout: 60_000 });
  check('the draft is gone once published', (await page.locator('.mk-banner', { hasText: 'ya no está' }).count()) === 1);

  // 7. The funnel, on the owner's statistics.
  await page.goto(`${BASE}/admin/visitas`, { timeout: 60_000 });
  const funnel = await page.locator('section[aria-labelledby="vs-roxi-funnel"] tbody tr').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim())));
  const counts = funnel.map((row) => Number(row[1]));
  check('the funnel counts each step once: photos, draft, form, published', counts.length === 4 && counts.every((n) => n >= 1), funnel);

  await context.close();
  await browser.close();
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
