/**
 * The styles of the districts in depth (docs/DISTRICTS-3D.md).
 *
 * A string, added to the page by the engine when it starts, and not a
 * stylesheet of its own on purpose. A stylesheet would have been neater to
 * write, but the first one a page loads on demand makes the build add its
 * stylesheet loader to every page of the site (measured: 0.45 KB more on each
 * of them, the heaviest included). This way the styles arrive inside the
 * engine's own file, after the page has painted and only on a device that is
 * given the depth, and no other page pays for the home page's decoration.
 *
 * Every rule waits for data-depth="on", which the engine sets when it starts
 * and takes away when it stops; without it — or after it — the cards are the
 * classic ones, drawn by app/home.css alone.
 *
 * Only transform and opacity move. The browser composites those without
 * laying the page out or painting it again, which is what keeps this smooth
 * on an inexpensive phone.
 *
 * The comments are here rather than in the text so that they are not sent.
 */
const ON = '[data-depth="on"]';

export const DEPTH_CSS = [
  // Each card is its own small stage, seen from in front of its own centre.
  `${ON} .hx-card { perspective: 900px; }`,

  // The card turns as one object and its parts sit at different depths, so the
  // link may neither clip nor isolate its children (either one flattens them):
  // the photograph's frame clips itself instead.
  `${ON} .hx-card-link, ${ON} .hx-card-link:hover {
    overflow: visible; isolation: auto; transform-style: preserve-3d; transition: none;
    transform: translateZ(calc(var(--lz, 0) * 1px)) rotateX(calc(var(--rx, 0) * 1deg)) rotateY(calc(var(--ry, 0) * 1deg)) scale(var(--ps, 1));
    box-shadow: 0 24px 44px -26px rgba(0, 0, 0, 0.98);
  }`,
  `${ON} .hx-card-art { overflow: hidden; border-radius: inherit; }`,

  // The photograph, a little larger than its frame so that it has somewhere to
  // move (photo.ts draws the canvas at the same enlargement: PHOTO_ZOOM). The
  // enlargement eases in once, as the depth arrives; after that the engine
  // moves it every frame and a transition would only make it lag.
  `${ON} .hx-card-photo {
    transform: translate3d(calc(var(--px, 0) * 1px), calc(var(--py, 0) * 1px), 0) scale(1.035);
    animation: dz-settle 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
  }`,
  '@keyframes dz-settle { from { transform: none; } }',
  // Level 1, no WebGL: the whole photograph slides behind its frame, so it needs more room at the edges.
  '[data-depth-level="1"] .hx-card-photo { transform: translate3d(calc(var(--px, 0) * 1px), calc(var(--py, 0) * 1px), 0) scale(1.07); }',
  '.dz-photo { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity 0.7s ease; }',
  '.dz-photo.is-on { opacity: 1; }',

  // The mark floats in front of the card and slides against it as the eye moves.
  `${ON} .hx-emblem {
    transform: translate3d(calc(var(--mx, 0) * 1px), calc(var(--my, 0) * 1px), 34px);
    transition: box-shadow 0.6s ease, background-color 0.6s ease;
  }`,
  // Its medallion has its own rim, so the drawn ring gives way to a shadow on
  // the card and a breath of the district's colour.
  `${ON} .hx-emblem.dz-medalled, ${ON} .hx-card-sanctuary .hx-emblem.dz-medalled {
    overflow: visible; background: none;
    box-shadow: 0 12px 16px -8px rgba(0, 0, 0, 0.9), 0 0 26px -5px color-mix(in srgb, var(--a) 78%, transparent);
  }`,
  `${ON} .hx-emblem.dz-medalled > svg { opacity: 0; transition: opacity 0.4s ease; }`,
  `.dz-medal {
    position: absolute; left: -6%; top: -6%; width: 112%; height: 112%; max-width: none;
    opacity: 0; transform: scale(0.82) rotate(-14deg);
    transition: opacity 0.5s ease, transform 0.9s cubic-bezier(0.2, 0.9, 0.25, 1.15);
  }`,
  '.dz-medalled > .dz-medal { opacity: 1; transform: none; }',
  // A line of light that crosses the medallion once (the engine starts it; nothing here loops).
  '.dz-glint { position: absolute; inset: 2%; border-radius: 50%; overflow: hidden; pointer-events: none; }',
  `.dz-glint::before {
    content: ""; position: absolute; top: -10%; bottom: -10%; left: 0; width: 34%;
    background: linear-gradient(90deg, transparent, rgba(255, 248, 226, 0.7), transparent);
    transform: translateX(-220%) skewX(-18deg);
  }`,

  // The arrow floats too, a little nearer the card than the medallion.
  `${ON} .hx-arrow, ${ON} .hx-card-link:hover .hx-arrow { transform: translateZ(20px); }`,

  // Light on the card's surface. One soft disc, larger than the card, moved by
  // a transform: a gradient redrawn at a new position each frame would be
  // painted each frame.
  `.dz-glare {
    position: absolute; inset: 0; z-index: 3; overflow: hidden; border-radius: inherit; pointer-events: none;
    opacity: var(--ga, 0); transform: translateZ(1px);
  }`,
  `.dz-glare::before {
    content: ""; position: absolute; left: 50%; top: 50%; width: 150%; aspect-ratio: 1; margin: -75% 0 0 -75%;
    background: radial-gradient(closest-side, rgba(255, 244, 216, 0.24), rgba(255, 244, 216, 0.07) 48%, transparent 74%);
    transform: translate3d(calc(var(--gx, 0) * 1px), calc(var(--gy, 0) * 1px), 0);
  }`,

  // Rising into place. Where the browser can tie an animation to the scroll
  // itself, a card lies back as it comes over the bottom edge and stands up as
  // it enters; the browser runs it, off the main thread, and a card that is
  // fully on screen is always fully risen, so nothing can be left half-way.
  // Elsewhere the cards simply are where they are.
  `@supports (animation-timeline: view()) {
    ${ON} .hx-card.dz-rise { transform-origin: 50% 100%; animation: dz-rise linear both; animation-timeline: view(); animation-range: entry 0% entry 100%; }
  }`,
  '@keyframes dz-rise { from { opacity: 0.6; transform: perspective(900px) translate3d(0, 30px, 0) rotateX(-28deg) scale(0.93); } }',

  // Belt and braces: the engine does not start for someone who asked for less
  // motion, and stops if they ask later.
  `@media (prefers-reduced-motion: reduce) {
    ${ON} .hx-card-link, ${ON} .hx-card-photo, ${ON} .hx-emblem, ${ON} .hx-arrow { transform: none; animation: none; }
    ${ON} .hx-card.dz-rise { animation: none; }
    .dz-glare, .dz-photo { display: none; }
  }`,
].join('\n');
