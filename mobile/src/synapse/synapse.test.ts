/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { injectedScript, parseMessage, toVisual } from './bridge.ts';
import { figureBox, heartOf, FIGURE_ASPECT } from './reconstruct.ts';
import { backdrop, HOLD_MS, LEAVE_MS, MAX_WAIT_MS, MIN_FORM_MS, START, step, type Inputs, type Timeline } from './timeline.ts';
import { isYavaya } from '../links.ts';
import F from './synapse.fixtures.json' with { type: 'json' };

const FRAME = F.frameMs;
const HALF = 2;
const base: Inputs = { target: 0, loaded: false, failed: false, skip: false, reducedMotion: false };

function run(state: Timeline, input: Partial<Inputs>, ms: number): Timeline {
  const frames = Array.from({ length: Math.ceil(ms / FRAME) });
  return frames.reduce<Timeline>((s) => step(s, { ...base, ...input }, FRAME), state);
}

test('she never looks complete before the page has loaded', () => {
  const s = run(START, { target: 1, loaded: false }, F.longWaitMs);
  assert.equal(s.phase, 'forming');
  assert.ok(s.shown < 1 && s.shown > F.almostWhole, `shown ${s.shown}`);
});

test('she follows the real progress and never goes backwards', () => {
  let s = run(START, { target: F.partly }, F.settleMs);
  assert.ok(Math.abs(s.shown - F.partly) < F.epsilon);
  s = run(s, { target: F.outOfOrder }, F.settleMs); // a progress event out of order
  assert.ok(Math.abs(s.shown - F.partly) < F.epsilon);
});

test('a fast page still gets a formation, then a short hold, then she leaves', () => {
  let s = run(START, { target: 1, loaded: true }, MIN_FORM_MS / HALF);
  assert.equal(s.phase, 'forming'); // not a flash
  s = run(s, { target: 1, loaded: true }, MIN_FORM_MS / HALF + FRAME * HALF);
  assert.equal(s.phase, 'holding');
  s = run(s, { target: 1, loaded: true }, HOLD_MS + FRAME);
  assert.equal(s.phase, 'leaving');
  s = run(s, { target: 1, loaded: true }, LEAVE_MS + FRAME);
  assert.equal(s.phase, 'done');
  assert.equal(backdrop(s), 0);
});

test('a tap goes straight to the page, at any point', () => {
  const s = run(START, { target: F.barely }, F.briefMs);
  const next = step(s, { ...base, skip: true }, FRAME);
  assert.equal(next.phase, 'leaving');
});

test('a failed or endless load still shows the page', () => {
  assert.equal(step(run(START, { target: F.slowPage }, F.briefMs), { ...base, failed: true }, FRAME).phase, 'leaving');
  const s = run(START, { target: F.slowPage }, MAX_WAIT_MS + FRAME * HALF);
  assert.notEqual(s.phase, 'forming');
});

test('a stalled frame does not jump her ahead', () => {
  const s = step(START, { ...base, target: 1 }, F.stalledFrameMs);
  assert.ok(s.shown < F.stalledCeiling, `shown ${s.shown}`);
});

test('the veil lifts smoothly from full to nothing as she leaves', () => {
  const at = (dissolve: number) => backdrop({ ...START, phase: 'leaving', dissolve });
  assert.equal(at(0), 1);
  const mid = at(F.veilMid.at);
  assert.ok(mid > F.veilMid.min && mid < F.veilMid.max);
  assert.ok(at(F.veilLate) < mid);
});

test('her picture fits any phone, centred and in proportion', () => {
  F.phones.forEach(([w, h]) => {
    const b = figureBox(w!, h!);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= w! + F.epsilon && b.y + b.height <= h! + F.epsilon, `${w}x${h}`);
    assert.ok(Math.abs(b.width / b.height - FIGURE_ASPECT) < F.epsilon);
    assert.ok(Math.abs(b.x * HALF + b.width - w!) < F.epsilon);
    const heart = heartOf(b);
    assert.ok(heart.y > b.y && heart.y < b.y + b.height / HALF);
  });
});

test("Roxi's state is reduced with the site's own precedence", () => {
  assert.equal(toVisual({ problem: true, orb: 'speaking' }), 'error');
  assert.equal(toVisual({ confirming: true, orb: 'listening' }), 'awaiting');
  assert.equal(toVisual({ orb: 'speaking', waiting: true }), 'speaking');
  assert.equal(toVisual({ orb: 'listening' }), 'listening');
  assert.equal(toVisual({ orb: 'idle', activity: 'searching' }), 'thinking');
  assert.equal(toVisual({ orb: 'idle' }), 'idle');
  assert.equal(toVisual({ orb: 'something-new' }), 'idle');
});

test('messages from the page are checked before anything acts on them', () => {
  const M = F.messages;
  assert.deepEqual(parseMessage(M.launcher.raw), { type: 'launcher', rect: M.launcher.rect });
  assert.deepEqual(parseMessage(M.noButton), { type: 'launcher', rect: null });
  assert.deepEqual(parseMessage(M.farAway), { type: 'launcher', rect: null });
  assert.deepEqual(parseMessage(M.negative), { type: 'launcher', rect: null });
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage('{"type":"openBank"}'), null);
  assert.equal(parseMessage('[1,2]'), null);
  const state = parseMessage(M.state);
  assert.deepEqual(state, { type: 'roxi-state', state: { available: true, open: false, visual: 'listening' } });
});

test('only https Yavaya pages count as Yavaya', () => {
  assert.equal(isYavaya('https://yavaya.lat/mercadito'), true);
  assert.equal(isYavaya('https://www.yavaya.lat/'), true);
  assert.equal(isYavaya('http://yavaya.lat/'), false);
  assert.equal(isYavaya('https://yavaya.lat.evil.example/'), false);
  assert.equal(isYavaya('https://checkout.stripe.com/x'), false);
});

/** A page just big enough for the injected script: one Roxi button, events, timers by hand. */
function fakePage(host: string, withButton: boolean) {
  const posted: unknown[] = [];
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const intervals: (() => void)[] = [];
  let clicked = 0;
  const button = { getBoundingClientRect: () => F.launcher, click: () => (clicked += 1) };
  const head = { appendChild: () => undefined };
  const on = (name: string, fn: (e: unknown) => void) => (listeners[name] ??= []).push(fn);
  const window: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) },
    addEventListener: on,
    dispatchEvent: () => true,
  };
  const document = {
    head,
    hidden: false,
    createElement: () => ({ textContent: '', parentNode: null }),
    querySelector: (sel: string) => (sel === '.roxi-launch' && withButton ? button : null),
    addEventListener: on,
  };
  const context = {
    window,
    document,
    location: { hostname: host },
    setInterval: (fn: () => void) => intervals.push(fn),
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    JSON,
    CustomEvent: class {},
  };
  return {
    run: (script: string) => runInNewContext(script, context),
    emit: (name: string, e: unknown) => (listeners[name] ?? []).forEach((fn) => fn(e)),
    tick: () => intervals.forEach((fn) => fn()),
    posted,
    clicks: () => clicked,
    window,
  };
}

test('the injected script reports the button and Roxi state, and opens her by her own button', () => {
  const page = fakePage('yavaya.lat', true);
  page.run(injectedScript(true));
  page.tick();
  const L = F.launcher;
  assert.deepEqual(page.posted.at(-1), { type: 'launcher', x: L.left, y: L.top, width: L.width, height: L.height });
  page.tick();
  assert.equal(page.posted.length, 1, 'an unchanged button is reported once');
  page.emit('roxi:state', { detail: { available: true, open: false, orb: 'speaking' } });
  const state = page.posted.at(-1) as Record<string, unknown>;
  assert.equal(state.type, 'roxi-state');
  assert.equal(state.orb, 'speaking');
  (page.window.__yavayaApp as { openRoxi: () => void }).openRoxi();
  assert.equal(page.clicks(), 1);
});

test('the injected script does nothing on pages that are not Yavaya', () => {
  const page = fakePage('checkout.stripe.com', true);
  page.run(injectedScript(true));
  page.tick();
  assert.equal(page.posted.length, 0);
  assert.equal(page.window.__yavayaApp, undefined);
});
