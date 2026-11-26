/**
 * What the app and the website say to each other, with no change to the website.
 *
 * The site already announces what Roxi is doing on a window event
 * (`roxi:state`, platform/src/ui/roxi/state-bus.ts) and already has her button
 * (`.roxi-launch`). A small script injected before each yavaya.lat page loads
 * forwards the first to the app, and reports where the second sits so Roxi's
 * Presence can take its place. Tapping the Presence clicks that same button,
 * so she opens exactly as she does on the web. Every message is checked here
 * before anything acts on it: page content is not trusted.
 *
 * The web button is hidden only when the app says its Presence is on screen
 * (`cover`), never by the page on its own: if anything in the bridge failed,
 * Roxi's own button stays, so she can never become unreachable.
 */

export type RoxiVisual = 'idle' | 'listening' | 'speaking' | 'thinking' | 'awaiting' | 'error';

export type RoxiState = {
  available: boolean;
  open: boolean;
  visual: RoxiVisual;
};

export type LauncherRect = { x: number; y: number; width: number; height: number };

export type BridgeMessage =
  | { type: 'roxi-state'; state: RoxiState }
  | { type: 'launcher'; rect: LauncherRect | null }
  | { type: 'classic-menu' };

const ORB_VISUALS: Record<string, RoxiVisual> = { listening: 'listening', speaking: 'speaking', thinking: 'thinking' };
/** Larger than any phone, so a nonsense rectangle from a page is refused. */
const MAX_COORD = 10000;

type Raw = Record<string, unknown>;

/** Her raw state, reduced to what the Presence shows. The precedence follows the site's own (state-bus.ts, toVisual). */
export function toVisual(raw: Raw): RoxiVisual {
  if (raw.problem === true) return 'error';
  if (raw.confirming === true) return 'awaiting';
  const orb = typeof raw.orb === 'string' ? ORB_VISUALS[raw.orb] : undefined;
  if (orb === 'speaking' || orb === 'listening') return orb;
  if (raw.waiting === true || (typeof raw.activity === 'string' && raw.activity) || orb === 'thinking') return 'thinking';
  return 'idle';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD;
}

function rectOf(raw: Raw): LauncherRect | null {
  const { x, y, width, height } = raw;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

const PARSERS: Record<string, (raw: Raw) => BridgeMessage> = {
  'roxi-state': (raw) => ({
    type: 'roxi-state',
    state: { available: raw.available === true, open: raw.open === true, visual: toVisual(raw) },
  }),
  launcher: (raw) => ({ type: 'launcher', rect: rectOf(raw) }),
  'classic-menu': () => ({ type: 'classic-menu' }),
};

export function parseMessage(data: string): BridgeMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as Raw).type;
  const parse = typeof type === 'string' ? PARSERS[type] : undefined;
  return parse ? parse(raw as Raw) : null;
}

/**
 * Injected before every page's own scripts. It only listens and measures; the
 * one thing it changes is hiding the web button while the app's Presence is
 * covering it, and only once the app has said so.
 */
export function injectedScript(synapse: boolean): string {
  return `(function () {
  if (window.__yavayaApp) { window.__yavayaApp.set(${synapse}); return; }
  var host = location.hostname;
  if (host !== 'yavaya.lat' && host !== 'www.yavaya.lat') return;
  var post = function (m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
  var synapse = ${synapse};
  var covered = false;
  var style = document.createElement('style');
  function paint() {
    style.textContent = covered ? '.roxi-launch{visibility:hidden!important}' : '';
    if (!style.parentNode && document.head) document.head.appendChild(style);
  }
  window.addEventListener('roxi:state', function (e) {
    var d = (e && e.detail) || {};
    post({ type: 'roxi-state', available: !!d.available, open: !!d.open, orb: d.orb, waiting: !!d.waiting,
      activity: d.activity || null, confirming: !!d.confirming, problem: !!d.problem });
  });
  var last = '';
  function measure() {
    paint();
    var el = document.querySelector('.roxi-launch');
    var r = el && el.getBoundingClientRect();
    var m = r && r.width > 0 ? { type: 'launcher', x: r.left, y: r.top, width: r.width, height: r.height } : { type: 'launcher' };
    var key = JSON.stringify(m);
    if (key !== last) { last = key; post(m); }
  }
  // The button is fixed in place; it moves only when the layout does, so a slow look is enough.
  setInterval(function () { if (!document.hidden) measure(); }, 700);
  window.addEventListener('resize', measure);
  document.addEventListener('DOMContentLoaded', measure);
  // In Classic the web button stays; holding it offers Synapse back.
  var timer = 0, swallow = false;
  document.addEventListener('pointerdown', function (e) {
    if (synapse || !e.target || !e.target.closest || !e.target.closest('.roxi-launch')) return;
    timer = setTimeout(function () { swallow = true; post({ type: 'classic-menu' }); }, 650);
  }, true);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
    document.addEventListener(n, function () { clearTimeout(timer); }, true);
  });
  document.addEventListener('click', function (e) {
    if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  window.__yavayaApp = {
    set: function (on) { synapse = !!on; if (!synapse) covered = false; last = ''; measure(); },
    cover: function (on) { covered = !!on && synapse; paint(); },
    openRoxi: function () {
      var el = document.querySelector('.roxi-launch');
      if (el) el.click(); else window.dispatchEvent(new CustomEvent('roxi:ask', { detail: {} }));
    }
  };
})(); true;`;
}

export const OPEN_ROXI = 'window.__yavayaApp && window.__yavayaApp.openRoxi(); true;';
export function setSynapseScript(on: boolean): string {
  return `window.__yavayaApp && window.__yavayaApp.set(${on}); true;`;
}

/** Hide (or show again) the web button under the app's Presence. */
export function coverScript(on: boolean): string {
  return `window.__yavayaApp && window.__yavayaApp.cover(${on}); true;`;
}
