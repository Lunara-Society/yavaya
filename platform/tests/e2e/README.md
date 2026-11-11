# Browser tests

Checks that need a real browser and a running site, kept apart from
`npm test` (which needs only Postgres). They create accounts, so they run
against a **local** database only; the setup script refuses anything else.

Requirements: Playwright with Chromium (`require('playwright')` — not a
dependency of this repository), `psql` on the path, and the site running
locally (`npm run dev`, or `npm run build && npx next start` for speed).

Run the site on the address `APP_URL` names (`http://localhost:3000` in
`.env.example`). A production build writes that origin into the map's style,
on purpose (see `app/api/map`), so a site served on another port draws no map:
the browser refuses the cross-origin style.

## Live tracking — `live-tracking.cjs`

A driver's phone position travels from the driver page through the server to
the customer's live map; a point that comes too soon after the last one is
held and sent, not dropped; nobody else can see it; a lost connection is said
and recovered from; an old position is shown as old; a delivered order stops
tracking; and the map's demonstration sends nothing to the server and changes
no table. Twenty-one checks, about two minutes.

```bash
npx tsx --conditions=react-server tests/e2e/tracking-setup.ts > /tmp/order.json
node tests/e2e/live-tracking.cjs /tmp/order.json
```

`E2E_BASE_URL` points it at another address (default `http://localhost:3000`).
Each run needs a fresh order: run the setup again first. The setup also clears
the local sign-in counters, since each run signs in three accounts and the
sign-in limit would otherwise refuse the third run in a quarter of an hour.

## Roxi's panel — `roxi-panel.cjs`

The conversation panel against a stand-in for the agent: the browser's
WebSocket to ElevenLabs is answered by the script, in the agent's protocol,
so Roxi can be made to answer, stay silent, lose the connection, be stopped
by a guardrail, or prepare a listing — with no real conversation and no cost.
Thirty-one checks, about two minutes (two of them wait out the real 12 s and
30 s timeouts):

- voice with a working microphone: the greeting is said once (the caption),
  the suggestions stay, and the thread is not restarted;
- a blocked microphone: no conversation is opened, one note says how to allow
  it, writing goes on, and "Leer sus respuestas en voz alta" reads answers;
- a slow answer: the seconds show, "Dejar de esperar", and the 30 s limit,
  each with "Enviar otra vez";
- a cut connection said as a cut, a guardrail stop as a refusal;
- a page left while waiting: offered again when the panel comes back;
- a listing prepared in Nandaime: the form's place field reads Nandaime.

```bash
ROXI_AGENT_ID=agent_localtest npm run dev
npx tsx --conditions=react-server tests/e2e/roxi-setup.ts > /tmp/roxi.json
node tests/e2e/roxi-panel.cjs /tmp/roxi.json
```

The listing check needs the publish form, which appears only with media
storage configured: locally, `MEDIA_STORAGE_PROVIDER=s3` and any `MEDIA_S3_*`
values are enough for it to render (nothing is uploaded). `E2E_SHOTS=<dir>`
saves screenshots of the panel and the form.

## Roxi's plans, memory and connections — `roxi-plans.cjs`

Against a local server started with `ROXI_KEY` and `ROXI_AGENT_ID` set:

```bash
npx tsx --conditions=react-server tests/e2e/roxi-plans-setup.ts > /tmp/plans.json
PLANS_SETUP=/tmp/plans.json BASE=http://localhost:3100 node tests/e2e/roxi-plans.cjs
```

Checks the plans page signed out and signed in (no buy button while credits
cannot be counted), Free's limits on goals and repeating reminders, saving,
ticking and forgetting, and, as an administrator trying Max, connecting a real
public MCP server (mcp.deepwiki.com), refusing a private address, listing and
calling its tools, and removing it. Needs internet access for the MCP part.

## The First Light, the worlds and the switches — `first-light.cjs`

The home page as the First Light (phone and seven widths, indexed, sound off
until asked for, no layout shift, reduced motion), the doors settling onto
each district's world, every district's world at two widths, and — given an
administrator — each of Admin's "Diseño del sitio" switches turned off (the
previous design back) and on again. With a member and the site run as
`ROXI_AGENT_ID=agent_localtest`, Roxi's states on the page too.

```bash
npx tsx --conditions=react-server tests/e2e/roxi-plans-setup.ts > /tmp/plans.json
npx tsx --conditions=react-server tests/e2e/roxi-setup.ts > /tmp/roxi.json
LOOKS_ADMIN=/tmp/plans.json BASE=http://localhost:3100 node tests/e2e/first-light.cjs /tmp/roxi.json
```

The switch checks leave both switches on, as they found them. Against the
live site, run it without `LOOKS_ADMIN` and without a member: it then only
reads pages.

## Board districts — `boards.cjs`

A member publishes in Hogar; a visitor sees the post but no contact; a second
member finds it, gets the WhatsApp button and reports it; a moderator removes
it and it is gone.

```bash
npx tsx --conditions=react-server tests/e2e/boards-setup.ts > /tmp/boards.json
node tests/e2e/boards.cjs /tmp/boards.json http://127.0.0.1:3000
```

## Roxi's voice in Chrome — `roxi-voice/`

Why: on 11 November 2026 a member's Samsung phone never got heard in Chrome
(ElevenLabs received 0 seconds of microphone audio) while Firefox worked.
`src/ui/roxi/voice-health.ts` gives a stuck voice start 3 seconds, closes
what it opened, reports it, and starts again on Firefox's audio path
(the device's own rate, resampled in JavaScript).

This runs twenty starts healthy and twenty with the 16 kHz path broken, in
Chromium posing as Android Chrome, against a local stand-in for ElevenLabs.
It needs the `ws` package, which is not a dependency of this repository:

```bash
mkdir -p /tmp/voice && (cd /tmp/voice && npm init -y >/dev/null && npm i ws@8.18.0)
cd tests/e2e/roxi-voice
npx esbuild entry.js --bundle --format=iife --outfile=bundle.js \
  --alias:@elevenlabs/client=../../../node_modules/@elevenlabs/client/dist/platform/web/index.js
NODE_PATH=/tmp/voice/node_modules node server.mjs 3412 &
node run.cjs
```

It cannot reproduce a real phone's audio hardware: it proves the fallback
and the cleanup, not the phone. The real check is ElevenLabs' record of the
conversation (`asr_usage.total_audio_input_seconds` above 0).
