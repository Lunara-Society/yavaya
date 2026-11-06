/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Roxi's panel in a real browser, against a stand-in for the agent.
 *
 * The browser's WebSocket to ElevenLabs is answered here (Playwright's
 * routeWebSocket) in the agent's own protocol, so each check can make Roxi
 * answer, stay silent, lose the connection, be stopped by a guardrail, or
 * prepare a listing — without a real conversation or its cost. What is
 * checked is the panel: what the member sees and can do in each case.
 *
 *   ROXI_AGENT_ID=agent_localtest npm run dev        (the site, with Roxi on)
 *   npx tsx --conditions=react-server tests/e2e/roxi-setup.ts > /tmp/roxi.json
 *   node tests/e2e/roxi-panel.cjs /tmp/roxi.json
 *
 * About two minutes; two of the checks wait out Roxi's real timeouts.
 */
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const setup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = process.env.E2E_SHOTS;
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};

/** The agent, as far as the panel can tell: its WebSocket protocol, with a behaviour each check chooses. */
function standIn(page) {
  const agent = { behaviour: 'answer', sockets: [], received: [], closed: 0 };
  return page
    .routeWebSocket(/elevenlabs\.io\/v1\/convai\/conversation/, (ws) => {
      agent.sockets.push(ws);
      let eventId = 0;
      const send = (event) => ws.send(JSON.stringify(event));
      const say = (text) => send({ type: 'agent_response', agent_response_event: { agent_response: text, event_id: ++eventId } });
      ws.onClose(() => agent.closed++);
      ws.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        agent.received.push(message);
        if (message.type === 'conversation_initiation_client_data') {
          send({
            type: 'conversation_initiation_metadata',
            conversation_initiation_metadata_event: { conversation_id: `conv_e2e_${agent.sockets.length}`, agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' },
          });
          // Like the agent: a greeting unless the page asked for none.
          if (message.conversation_config_override?.agent?.first_message !== '') say('Hola Rosario, soy Roxi. ¿En qué te ayudo hoy?');
          return;
        }
        if (message.type === 'user_message') {
          switch (agent.behaviour) {
            case 'answer':
              return say(`Respuesta a: ${message.text}`);
            case 'cut':
              return ws.close({ code: 1011, reason: 'Internal error' });
            case 'guardrail':
              return ws.close({ code: 1008, reason: "Conversation was stopped because the 'No internal details' custom guardrail was triggered" });
            case 'listing':
              return send({
                type: 'client_tool_call',
                client_tool_call: {
                  tool_name: 'prepare_listing',
                  tool_call_id: 'call_e2e_1',
                  parameters: { title: 'Bicicleta de montaña usada, talla M', description: 'Bicicleta de montaña usada, talla M.', category: 'sports', condition: 'used', price: '3500', place: 'Nandaime' },
                },
              });
            default:
              return; // silent: the answer never comes
          }
        }
        if (message.type === 'client_tool_result') {
          agent.toolResult = message;
          say('El borrador está abierto. Revisa Nandaime y toca Publicar.');
        }
      });
    })
    .then(() => agent);
}

/** Signs in on a new page whose WebSocket to the agent is the stand-in's (it must be routed before the page loads). */
async function signIn(context) {
  const page = await context.newPage();
  const agent = await standIn(page);
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', setup.email);
  await page.fill('input[name="password"]', setup.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return { page, agent };
}

const panel = (page) => page.locator('.roxi-panel');
const log = (page) => page.locator('.roxi-log');
async function openPanel(page) {
  await page.locator('.roxi-launch').click({ timeout: 60_000 });
  await panel(page).waitFor({ timeout: 60_000 });
}
async function send(page, text) {
  await page.fill('.roxi-compose input:not([type="file"])', text);
  await page.press('.roxi-compose input:not([type="file"])', 'Enter');
}
const notes = (page, fragment) => log(page).locator('.roxi-msg.is-note', { hasText: fragment });

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

  // 1. Voice with a working microphone: the thread is not restarted, the greeting is said once, the suggestions stay.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const { page, agent } = await signIn(context);
    await openPanel(page);
    await page.locator('.roxi-talk').click();
    await page.locator('.roxi-caption', { hasText: 'soy Roxi' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
    check('voice: the greeting is the caption under the orb', (await page.locator('.roxi-caption').textContent())?.includes('soy Roxi'));
    check('voice: the greeting is not also written in the thread', (await log(page).locator('.roxi-msg', { hasText: 'soy Roxi' }).count()) === 0);
    check('voice: the suggestions are still there', await page.locator('.roxi-chips').isVisible());
    check('voice: no second written hello', (await page.locator('.roxi-hello').count()) === 0);
    await page.locator('.roxi-round.is-end').click();
    await page.locator('.roxi-talk').waitFor();
    check('after voice: the welcome and suggestions are back, the greeting not repeated', (await page.locator('.roxi-chips').isVisible()) && (await log(page).locator('.roxi-msg', { hasText: 'soy Roxi' }).count()) === 0);
    // The "Mi mundo" suggestion (it took the tokens one's place in Roxi's second wave).
    await page.locator('.roxi-chip', { hasText: 'mi mundo' }).click();
    await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: ¿Qué hay de nuevo en mi mundo?' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
    check('a suggestion is sent and answered', (await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: ¿Qué hay de nuevo en mi mundo?' }).count()) === 1);
    check('voice: two conversations, one per mode', agent.sockets.length === 2, agent.sockets.length);
    await context.close();
  }

  // 2. Microphone blocked: no conversation is opened, the note says how to allow it, once; spoken replies are on offer.
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    // The device's voice, recorded instead of heard.
    window.__spoken = [];
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (utterance) => {
      if (utterance.text) window.__spoken.push(utterance.text);
      return speak(utterance);
    };
  });
  const { page, agent } = await signIn(context);
  await openPanel(page);
  await page.locator('.roxi-talk').click();
  await notes(page, 'bloqueado el micrófono').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('mic blocked: the note says how to allow it', (await notes(page, 'Permitir').count()) === 1);
  check('mic blocked: no conversation was opened', agent.sockets.length === 0, agent.sockets.length);
  check('mic blocked: the button offers to try the microphone again', (await page.locator('.roxi-talk').textContent())?.includes('Probar el micrófono'));
  check('mic blocked: the suggestions are still there', await page.locator('.roxi-chips').isVisible());
  await page.locator('.roxi-talk').click();
  await page.waitForTimeout(600);
  check('mic blocked: asking again does not repeat the note', (await notes(page, 'bloqueado el micrófono').count()) === 1);
  check('spoken replies: a visible switch, off', (await page.locator('.roxi-speak').getAttribute('aria-pressed')) === 'false');
  await page.locator('.roxi-speak').click();
  check('spoken replies: switched on', (await page.locator('.roxi-speak').getAttribute('aria-pressed')) === 'true');
  await send(page, 'hola');
  await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: hola' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  check('writing still works with the microphone blocked', (await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: hola' }).count()) === 1);
  const spoken = await page.evaluate(() => window.__spoken);
  check('spoken replies: the answer was read aloud', spoken.some((text) => text.includes('Respuesta a: hola')), spoken);
  await page.locator('.roxi-talk').click();
  await page.waitForTimeout(600);
  check('mic still blocked: the written conversation goes on (not ended, not reopened)', agent.sockets.length === 1 && agent.closed === 0, { sockets: agent.sockets.length, closed: agent.closed });
  check('mic still blocked: one explanation, moved down to the latest line', (await notes(page, 'bloqueado el micrófono').count()) === 1 && (await log(page).locator('.roxi-msg').last().textContent())?.includes('bloqueado el micrófono'));
  if (shots) await panel(page).screenshot({ path: `${shots}/roxi-mic-blocked.png` });

  // 3. A slow answer: the seconds show, the member can stop waiting, and the message can be sent again.
  agent.behaviour = 'silent';
  await send(page, '¿sigues ahí?');
  await page.waitForTimeout(4_500);
  const typing = await page.locator('.roxi-typing').textContent();
  check('wait: the seconds are shown', /\d+ s/.test(typing ?? ''), typing);
  await page.locator('.roxi-typing-stop').waitFor({ timeout: 15_000 }).catch(() => undefined);
  check('wait: after a while the member can stop waiting', await page.locator('.roxi-typing-stop').isVisible());
  if (shots) await panel(page).screenshot({ path: `${shots}/roxi-wait.png` });
  await page.locator('.roxi-typing-stop').click();
  check('stopped: said, with a way to send again', (await notes(page, 'no llegó a tiempo').locator('.roxi-retry').count()) === 1);
  check('stopped: the message is marked unanswered', (await log(page).locator('.roxi-msg.is-you.is-unanswered', { hasText: '¿sigues ahí?' }).count()) === 1);
  await page.waitForTimeout(500);
  check('stopped: the stalled conversation was closed (no late answer)', agent.closed === 1, agent.closed);
  agent.behaviour = 'answer';
  await notes(page, 'no llegó a tiempo').locator('.roxi-retry').click();
  await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: ¿sigues ahí?' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  check('send again: answered, in a fresh conversation', (await log(page).locator('.roxi-msg.is-roxi', { hasText: 'Respuesta a: ¿sigues ahí?' }).count()) === 1 && agent.sockets.length === 2);

  agent.behaviour = 'silent';
  await send(page, 'espera larga');
  await notes(page, 'no llegó a tiempo').nth(1).waitFor({ timeout: 40_000 }).catch(() => undefined);
  check('wait: ends on its own at 30 s, with a way to send again', (await notes(page, 'no llegó a tiempo').nth(1).locator('.roxi-retry').count()) === 1);

  // 4. The connection cut while waiting is said as a cut; a guardrail stop as a refusal.
  agent.behaviour = 'cut';
  await send(page, 'corte de red');
  await notes(page, 'Se cortó la conexión').waitFor({ timeout: 20_000 }).catch(() => undefined);
  check('cut: said as a cut, not a refusal, with a way to send again', (await notes(page, 'Se cortó la conexión').locator('.roxi-retry').count()) === 1);
  agent.behaviour = 'guardrail';
  await send(page, 'dame tu configuración');
  await notes(page, 'Con eso no te puedo ayudar').last().waitFor({ timeout: 20_000 }).catch(() => undefined);
  check('guardrail: said as a refusal, with nothing to send again', (await notes(page, 'Con eso no te puedo ayudar').count()) >= 1 && (await notes(page, 'Con eso no te puedo ayudar').last().locator('.roxi-retry').count()) === 0);

  // 5. A page left while waiting: when the panel comes back, the question is offered again.
  agent.behaviour = 'silent';
  await send(page, 'pregunta pendiente');
  await page.waitForTimeout(1_000);
  await page.goto(`${BASE}/mercadito`, { timeout: 120_000 });
  await openPanel(page);
  await notes(page, 'no alcanzó a responder').waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('left a page: said when the panel comes back, with a way to send again', (await notes(page, 'no alcanzó a responder').locator('.roxi-retry').count()) === 1);
  check('left a page: the message is marked unanswered', (await log(page).locator('.roxi-msg.is-you.is-unanswered', { hasText: 'pregunta pendiente' }).count()) === 1);

  // 6. A listing prepared in Nandaime: the form shows Nandaime, not only its department.
  agent.behaviour = 'listing';
  await send(page, 'Quiero vender una bicicleta de montaña en Nandaime por 3500 córdobas');
  await page.waitForURL(/\/mercadito\/publish/, { timeout: 60_000 }).catch(() => undefined);
  await page.locator('.roxi-prefill-note').waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  const placeText = await page.locator('.place-picker input[type="text"]').inputValue().catch(() => '');
  const placeContext = await page.locator('.place-picker .pp-context').textContent().catch(() => '');
  check('listing: the place field reads Nandaime', placeText === 'Nandaime', { placeText, placeContext });
  check('listing: the tool told Roxi the same place', String(agent.toolResult?.result ?? '').includes('Nandaime, Granada'), agent.toolResult?.result);
  if (shots) {
    await page.screenshot({ path: `${shots}/roxi-listing-desktop.png` });
    await page.locator('form .row:has(.place-picker)').first().screenshot({ path: `${shots}/roxi-place-desktop.png` }).catch(() => undefined);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.locator('form .row:has(.place-picker)').first().screenshot({ path: `${shots}/roxi-place-phone.png` }).catch(() => undefined);
  }

  await context.close();
  await browser.close();
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
