/**
 * Yavaya's illustration system.
 *
 * Every picture here is drawn in code: engraved line work in the manner of a
 * banknote or a bank's letterhead — navy, gold, ivory, and each district's
 * own colour. The Master Bible asks for "government-level trust, private-bank
 * quality" and warns against startup gradients and neon; engraving is the
 * visual language people already associate with things that are real and
 * lasting.
 *
 * Drawn rather than photographed, on purpose: nothing here can be mistaken for
 * a real member, a real listing or a real place Yavaya is claiming. Scenes are
 * evocative of the isthmus — volcanoes, plazas, markets, the quetzal — without
 * naming anywhere.
 *
 * Everything is deterministic (seeded, no Math.random) so the server and the
 * browser render the same markup. All art is decorative and hidden from
 * assistive technology; the text beside it carries the meaning.
 */

import type { ReactNode } from 'react';
import type { DistrictId } from './blocks';

// --- Deterministic helpers -----------------------------------------------------

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A guilloché rosette: the interlaced curve printed on banknotes and
 * certificates because it is hard to forge. A hypotrochoid, modulated.
 */
export function rosettePath(options: {
  cx: number;
  cy: number;
  radius: number;
  lobes: number;
  depth: number;
  turns?: number;
  steps?: number;
  phase?: number;
}): string {
  const { cx, cy, radius, lobes, depth } = options;
  const turns = options.turns ?? 1;
  const steps = options.steps ?? 720;
  const phase = options.phase ?? 0;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const r = radius * (1 - depth + depth * Math.cos(lobes * t + phase));
    points.push(`${r1(cx + r * Math.cos(t))},${r1(cy + r * Math.sin(t))}`);
  }
  return `M${points.join('L')}Z`;
}

/** A banknote rosette: many phased curves laid over each other. */
export function Guilloche({
  size = 400,
  lobes = 18,
  rings = 9,
  className,
  strokeWidth = 0.6,
}: {
  size?: number;
  lobes?: number;
  rings?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const c = size / 2;
  const paths: ReactNode[] = [];
  for (let i = 0; i < rings; i += 1) {
    const shift = (i / rings) * ((Math.PI * 2) / lobes);
    paths.push(<path key={`o${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.95, lobes, depth: 0.05, phase: shift * lobes })} />);
    paths.push(<path key={`m${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.8, lobes: lobes + 6, depth: 0.07, phase: -shift * (lobes + 6) })} />);
    paths.push(<path key={`i${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.58, lobes: Math.round(lobes * 0.75), depth: 0.1, phase: shift * lobes * 0.75 })} />);
  }
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        {paths}
        <circle cx={c} cy={c} r={c * 0.99} strokeWidth={strokeWidth * 1.6} />
        <circle cx={c} cy={c} r={c * 0.93} />
        <circle cx={c} cy={c} r={c * 0.36} strokeWidth={strokeWidth * 1.4} />
      </g>
    </svg>
  );
}

/** A thin ornamental band — the rule between sections of a certificate. */
export function OrnamentRule({ className }: { className?: string }) {
  const width = 1200;
  const wave = (amplitude: number, period: number, phase: number) => {
    const points: string[] = [];
    for (let x = 0; x <= width; x += 4) {
      points.push(`${x},${r1(12 + amplitude * Math.sin((x / period) * Math.PI * 2 + phase))}`);
    }
    return `M${points.join('L')}`;
  };
  return (
    <svg className={className} viewBox={`0 0 ${width} 24`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.7" vectorEffect="non-scaling-stroke">
        <path d={wave(7, 60, 0)} />
        <path d={wave(7, 60, Math.PI)} />
        <path d={wave(4, 30, Math.PI / 2)} opacity="0.6" />
      </g>
    </svg>
  );
}

// --- Shared scene parts ------------------------------------------------------

/** Engraving hatch: parallel lines that shade a shape the way a burin would. */
function Hatch({ id, angle = 45, gap = 4, width = 0.6, color = 'currentColor' }: {
  id: string;
  angle?: number;
  gap?: number;
  width?: number;
  color?: string;
}) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1="0" y1="0" x2="0" y2={gap} stroke={color} strokeWidth={width} />
    </pattern>
  );
}

function Stars({ seed, count, width, height, className }: {
  seed: number;
  count: number;
  width: number;
  height: number;
  className?: string;
}) {
  const random = seeded(seed);
  return (
    <g className={className}>
      {Array.from({ length: count }, (_, i) => {
        const x = r1(random() * width);
        const y = r1(random() * height);
        const r = r1(0.4 + random() * 1.3);
        const delay = r1(random() * 6);
        return <circle key={i} cx={x} cy={y} r={r} style={{ animationDelay: `${delay}s` }} />;
      })}
    </g>
  );
}

/** A ridge of mountains as a path, deterministic from a seed. */
function ridge(seed: number, width: number, base: number, peaks: Array<[number, number]>, roughness = 6): string {
  const random = seeded(seed);
  const pts: Array<[number, number]> = [[0, base]];
  const sorted = [...peaks].sort((a, b) => a[0] - b[0]);
  for (let x = 0; x <= width; x += 12) {
    let y = base;
    for (const [px, height] of sorted) {
      const spread = height * 1.9;
      const d = Math.abs(x - px);
      if (d < spread) y = Math.min(y, base - height * (1 - d / spread) ** 1.35);
    }
    pts.push([x, y + (random() - 0.5) * roughness]);
  }
  pts.push([width, base]);
  return `M${pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join('L')}V${base + 400}H0Z`;
}


/** A palm: a leaning trunk and a crown of drooping fronds. */
function Palm({ x, y, height, lean, seed }: { x: number; y: number; height: number; lean: number; seed: number }) {
  const random = seeded(seed);
  const topX = x + lean * (height / 60);
  const topY = y - height;
  const fronds = Array.from({ length: 9 }, (_, i) => {
    const angle = -Math.PI + (i / 8) * Math.PI + (random() - 0.5) * 0.25;
    const length = height * (0.42 + random() * 0.12);
    const ex = topX + Math.cos(angle) * length;
    const ey = topY + Math.sin(angle) * length * 0.18 + length * 0.62;
    const mx = topX + Math.cos(angle) * length * 0.55;
    const my = topY + Math.sin(angle) * length * 0.32 - length * 0.12;
    const w = length * 0.11;
    return `M${r1(topX)},${r1(topY)} Q${r1(mx)},${r1(my - w)} ${r1(ex)},${r1(ey)} Q${r1(mx)},${r1(my + w)} ${r1(topX)},${r1(topY)}Z`;
  });
  return (
    <g>
      <path
        d={`M${x - 7},${y} Q${r1(x + lean * 1.2)},${r1(y - height * 0.5)} ${r1(topX - 2.5)},${r1(topY)} L${r1(topX + 2.5)},${r1(topY)} Q${r1(x + lean * 1.2 + 8)},${r1(y - height * 0.5)} ${x + 7},${y} Z`}
        fill="#040a15"
      />
      <path d={fronds.join(' ')} fill="#040a15" />
      <path d={fronds.join(' ')} fill="none" stroke="rgba(212,175,55,0.28)" strokeWidth="0.8" />
    </g>
  );
}

// --- Hero ------------------------------------------------------------------------

/**
 * The home page's night landscape: a volcanic skyline over a still lake, a
 * gold moon, a small town with its lights on. The isthmus at its most
 * recognisable, without naming a single place.
 */
export function HeroScene({ className }: { className?: string }) {
  const W = 1600;
  const H = 900;
  const random = seeded(42);
  const windows = Array.from({ length: 34 }, () => ({
    x: r1(1040 + random() * 520),
    y: r1(640 + random() * 90),
    lit: random() > 0.35,
  }));
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050b16" />
          <stop offset="0.55" stopColor="#0b1a33" />
          <stop offset="1" stopColor="#13284a" />
        </linearGradient>
        <radialGradient id="hero-moon-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f3dc8a" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#d4af37" stopOpacity="0.16" />
          <stop offset="1" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1f3b" />
          <stop offset="1" stopColor="#050b16" />
        </linearGradient>
        <Hatch id="hero-hatch-far" angle={-35} gap={5} width={0.55} color="rgba(212,175,55,0.16)" />
        <Hatch id="hero-hatch-mid" angle={-50} gap={4} width={0.6} color="rgba(212,175,55,0.22)" />
        <Hatch id="hero-hatch-moon" angle={0} gap={3.2} width={0.5} color="rgba(8,17,32,0.28)" />
      </defs>

      <rect width={W} height={H} fill="url(#hero-sky)" />
      <Stars seed={7} count={140} width={W} height={520} className="art-stars" />

      <g className="art-rise art-d1">
        <circle cx="1360" cy="230" r="240" fill="url(#hero-moon-glow)" className="art-glow" />
        <circle cx="1360" cy="230" r="78" fill="#e8c766" />
        <circle cx="1360" cy="230" r="78" fill="url(#hero-hatch-moon)" />
        <g fill="none" stroke="rgba(8,17,32,0.25)" strokeWidth="1">
          <circle cx="1340" cy="214" r="13" />
          <circle cx="1380" cy="250" r="9" />
          <circle cx="1374" cy="203" r="5" />
        </g>
      </g>

      <g className="art-rise art-d2">
        <path d={ridge(3, W, 640, [[260, 250], [620, 180], [980, 120], [1420, 210]], 8)} fill="#0e2140" />
        <path d={ridge(3, W, 640, [[260, 250], [620, 180], [980, 120], [1420, 210]], 8)} fill="url(#hero-hatch-far)" />
      </g>
      <g className="art-rise art-d3">
        {/* The volcano: a clean cone with a crater and a thread of smoke. */}
        <path d="M40 660 L300 320 Q330 290 360 320 L640 660 Z" fill="#0a1a33" />
        <path d="M40 660 L300 320 Q330 290 360 320 L640 660 Z" fill="url(#hero-hatch-mid)" />
        <path d="M300 320 Q330 290 360 320" fill="none" stroke="#d4af37" strokeWidth="1.4" opacity="0.8" />
        <path
          className="art-smoke"
          d="M330 302 C 320 260, 352 240, 338 200 S 360 140, 344 100"
          fill="none"
          stroke="rgba(248,246,241,0.07)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path d={ridge(11, W, 700, [[80, 110], [1180, 130], [1520, 90]], 5)} fill="#081628" />
      </g>

      {/* The lake, and the moon's road across it. */}
      <rect y="680" width={W} height={H - 680} fill="url(#hero-lake)" />
      <g stroke="#e8c766" strokeLinecap="round" className="art-shimmer">
        {Array.from({ length: 16 }, (_, i) => {
          const y = 700 + i * 12;
          const half = 70 - i * 3.6 + (i % 2) * 12;
          return <line key={i} x1={1360 - half} x2={1360 + half} y1={y} y2={y} strokeWidth={1.4 - i * 0.06} opacity={0.7 - i * 0.04} />;
        })}
      </g>

      {/* A small town at the water's edge with its lights on. */}
      <g className="art-rise art-d4">
        <path
          d="M1020 690 V650 h40 v-18 l22 -16 22 16 v18 h36 v-26 l18 -12 18 12 v26 h52 v-44 h10 v-14 h10 v14 h10 v44 h60 v-22 l26 -18 26 18 v22 h70 v-12 h90 V690 Z"
          fill="#050d1c"
        />
        <g fill="#f0cf6e">
          {windows.map((w, i) => (w.lit && w.y > 652 ? <rect key={i} x={w.x} y={w.y} width="3.4" height="4.4" opacity="0.85" /> : null))}
        </g>
        {/* Bell tower */}
        <rect x="1238" y="632" width="4" height="10" fill="#f0cf6e" opacity="0.9" />
      </g>

      {/* Foreground: the near bank with palms, drawn dark against the lake. */}
      <g className="art-rise art-d5">
        <path d="M0 770 Q220 716 430 758 T 840 780 V900 H0 Z" fill="#040a15" />
        <Palm x={150} y={770} height={250} lean={-14} seed={3} />
        <Palm x={250} y={764} height={190} lean={10} seed={8} />
        <Palm x={1500} y={800} height={210} lean={12} seed={12} />
        <path d="M1260 800 Q1420 770 1600 786 V900 H1260 Z" fill="#040a15" />
      </g>
    </svg>
  );
}

// --- District scenes -------------------------------------------------------------

type SceneProps = { className?: string };

const SCENE_W = 480;
const SCENE_H = 320;

function SceneFrame({ id, tone, deep, children, className }: {
  id: string;
  tone: string;
  deep: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg className={className} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={deep} />
          <stop offset="1" stopColor={tone} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f3dc8a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
        <Hatch id={`${id}-hatch`} angle={-45} gap={4} width={0.55} color="rgba(248,246,241,0.10)" />
        <Hatch id={`${id}-hatch-gold`} angle={-45} gap={3.5} width={0.55} color="rgba(212,175,55,0.30)" />
      </defs>
      <rect width={SCENE_W} height={SCENE_H} fill={`url(#${id}-sky)`} />
      <rect width={SCENE_W} height={SCENE_H} fill={`url(#${id}-hatch)`} />
      {children}
      <rect x="6" y="6" width={SCENE_W - 12} height={SCENE_H - 12} fill="none" stroke="rgba(212,175,55,0.35)" strokeWidth="0.8" />
    </svg>
  );
}

/** Mercadito: a row of market stalls under striped awnings, lanterns strung between them. */
function MercaditoScene({ className }: SceneProps) {
  const id = 'sc-mk';
  const stall = (x: number, stripeA: string, stripeB: string, goods: string[]) => (
    <g key={x}>
      <rect x={x + 6} y="170" width="4" height="96" fill="#07140f" />
      <rect x={x + 110} y="170" width="4" height="96" fill="#07140f" />
      {/* Striped awning with a scalloped edge */}
      <path d={`M${x} 150 L${x + 120} 150 L${x + 126} 176 L${x - 6} 176 Z`} fill={stripeA} />
      {[0, 1, 2, 3, 4].map((s) => (
        <path key={s} d={`M${x + 12 + s * 24} 150 L${x + 24 + s * 24} 150 L${x + 26 + s * 24.6} 176 L${x + 12.6 + s * 24.6} 176 Z`} fill={stripeB} />
      ))}
      <path
        d={`M${x - 6} 176 ${[0, 1, 2, 3, 4, 5].map((s) => `q11 12 22 0`).join(' ')}`}
        fill={stripeA}
        transform={`translate(0 0)`}
      />
      {/* Counter and goods */}
      <rect x={x - 2} y="222" width="124" height="44" fill="#4a3220" />
      <rect x={x - 2} y="222" width="124" height="44" fill={`url(#${id}-hatch-gold)`} opacity="0.6" />
      <rect x={x - 4} y="218" width="128" height="6" fill="#6b4a2c" stroke="#d4af37" strokeWidth="0.8" />
      {goods.map((color, i) => (
        <circle key={i} cx={x + 12 + (i % 6) * 19} cy={216 - Math.floor(i / 6) * 11} r="7.5" fill={color} />
      ))}
    </g>
  );
  return (
    <SceneFrame id={id} tone="#1f9d6b" deep="#06231a" className={className}>
      <circle cx="380" cy="70" r="70" fill={`url(#${id}-glow)`} className="art-glow" />
      <circle cx="380" cy="70" r="22" fill="#e8c766" />
      <path d="M40 150 L150 60 Q162 50 174 60 L300 150 Z" fill="#0a2e22" />
      <path d="M40 150 L150 60 Q162 50 174 60 L300 150 Z" fill={`url(#${id}-hatch-gold)`} opacity="0.55" />
      <path d="M150 60 Q162 50 174 60" stroke="#d4af37" strokeWidth="1" fill="none" />
      <rect y="150" width={SCENE_W} height="170" fill="#0a2a1f" />
      {stall(24, '#c9452f', '#f3e3c3', ['#e8b531', '#d9542e', '#e8b531', '#7fb24a', '#d9542e', '#e8b531', '#7fb24a', '#e8b531'])}
      {stall(180, '#1f9d6b', '#f3e3c3', ['#7fb24a', '#e8b531', '#7fb24a', '#c9452f', '#e8b531', '#7fb24a', '#c9452f'])}
      {stall(336, '#d4af37', '#0e3a2b', ['#d9542e', '#e8b531', '#d9542e', '#7fb24a', '#e8b531', '#d9542e', '#e8b531', '#7fb24a'])}
      {/* Lantern string */}
      <path d="M0 120 Q120 150 240 124 T 480 122" fill="none" stroke="rgba(248,246,241,0.4)" strokeWidth="0.8" />
      {[30, 72, 114, 156, 198, 240, 282, 324, 366, 408, 450].map((x, i) => {
        const y = 120 + Math.sin((x / 480) * Math.PI * 2) * 10 + 14;
        return (
          <g key={x} className="art-twinkle" style={{ animationDelay: `${(i % 5) * 0.8}s` }}>
            <circle cx={x} cy={y} r="7" fill={`url(#${id}-glow)`} />
            <circle cx={x} cy={y} r="2.6" fill="#f3dc8a" />
          </g>
        );
      })}
      <rect y="266" width={SCENE_W} height="54" fill="#061a13" />
    </SceneFrame>
  );
}

/** YavayaGo: a courier on a night road, the city behind and light trails ahead. */
function YavayaGoScene({ className }: SceneProps) {
  const id = 'sc-go';
  const random = seeded(19);
  return (
    <SceneFrame id={id} tone="#f07a1f" deep="#1a0d05" className={className}>
      <g fill="#140a04">
        {Array.from({ length: 16 }, (_, i) => {
          const h = 40 + random() * 90;
          return <rect key={i} x={i * 31} y={190 - h} width="27" height={h} />;
        })}
      </g>
      <g fill="#f3c46e" opacity="0.75">
        {Array.from({ length: 60 }, (_, i) => (
          <rect key={i} x={r1(random() * 480)} y={r1(110 + random() * 76)} width="2.4" height="3" />
        ))}
      </g>
      <path d="M0 190 H480 V320 H0 Z" fill="#100804" />
      {/* The road, in perspective */}
      <path d="M200 190 L280 190 L480 320 L0 320 Z" fill="#1c1008" />
      <path d="M200 190 L280 190 L480 320 L0 320 Z" fill={`url(#${id}-hatch-gold)`} opacity="0.35" />
      <g stroke="#f3dc8a" strokeWidth="3" strokeLinecap="round" opacity="0.8">
        <line x1="240" y1="200" x2="240" y2="210" />
        <line x1="240" y1="224" x2="240" y2="240" />
        <line x1="240" y1="258" x2="240" y2="282" />
        <line x1="240" y1="302" x2="240" y2="320" />
      </g>
      {/* Light trails */}
      <g fill="none" strokeLinecap="round" className="art-trail">
        <path d="M-20 300 C 120 260, 190 214, 262 196" stroke="#f07a1f" strokeWidth="3" opacity="0.8" />
        <path d="M-20 312 C 130 270, 196 222, 266 198" stroke="#f3dc8a" strokeWidth="1.6" opacity="0.8" />
        <path d="M500 306 C 360 262, 300 220, 222 196" stroke="#d6334f" strokeWidth="2.2" opacity="0.6" />
      </g>
      {/* Courier with delivery box */}
      <g transform="translate(262 196) scale(1.3)" stroke="rgba(243,220,138,0.55)" strokeWidth="0.6">
        <circle cx="0" cy="58" r="15" fill="none" stroke="#f3dc8a" strokeWidth="7" opacity="0.35" />
        <circle cx="70" cy="58" r="15" fill="none" stroke="#f3dc8a" strokeWidth="7" opacity="0.35" />
        <circle cx="0" cy="58" r="15" fill="none" stroke="#0a0502" strokeWidth="5" />
        <circle cx="70" cy="58" r="15" fill="none" stroke="#0a0502" strokeWidth="5" />
        <path d="M0 58 L22 34 L52 34 L70 58" fill="none" stroke="#0a0502" strokeWidth="6" strokeLinejoin="round" />
        <path d="M40 34 L46 6 L30 4" fill="none" stroke="#0a0502" strokeWidth="6" strokeLinecap="round" />
        <rect x="-6" y="4" width="30" height="26" rx="3" fill="#f07a1f" />
        <path d="M-6 14 H24" stroke="#1a0d05" strokeWidth="1.2" />
        <circle cx="38" cy="-8" r="9" fill="#0a0502" />
        <path d="M34 2 L26 30 L48 34" fill="none" stroke="#0a0502" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="78" cy="34" r="4" fill="#f3dc8a" />
        <path d="M82 30 L150 10 L150 60 Z" fill="#f3dc8a" opacity="0.14" />
      </g>
    </SceneFrame>
  );
}

/** Work: the financial district — a colonnaded hall before orderly towers. */
function WorkScene({ className }: SceneProps) {
  const id = 'sc-work';
  const random = seeded(23);
  const towers: Array<[number, number, number]> = [
    [30, 70, 150],
    [110, 60, 200],
    [300, 70, 180],
    [380, 64, 220],
  ];
  return (
    <SceneFrame id={id} tone="#3c6df0" deep="#050d24" className={className}>
      <g stroke="rgba(248,246,241,0.07)" strokeWidth="0.6">
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="320" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 40} x2="480" y2={i * 40} />
        ))}
      </g>
      {towers.map(([x, w, h]) => (
        <g key={x}>
          <rect x={x} y={270 - h} width={w} height={h} fill="#0a1638" />
          <rect x={x} y={270 - h} width={w} height={h} fill={`url(#${id}-hatch)`} />
          {Array.from({ length: Math.floor(h / 16) }, (_, row) =>
            Array.from({ length: Math.floor(w / 14) }, (_, col) =>
              random() > 0.55 ? (
                <rect key={`${row}-${col}`} x={x + 5 + col * 14} y={270 - h + 8 + row * 16} width="7" height="8" fill="#f0cf6e" opacity={r1(0.45 + random() * 0.5)} />
              ) : null,
            ),
          )}
        </g>
      ))}
      {/* Colonnaded hall */}
      <path d="M150 150 L240 108 L330 150 Z" fill="#0d1d4a" stroke="#d4af37" strokeWidth="1.2" />
      <circle cx="240" cy="134" r="8" fill="none" stroke="#d4af37" strokeWidth="1" />
      <rect x="150" y="150" width="180" height="10" fill="#0d1d4a" stroke="#d4af37" strokeWidth="1" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x={160 + i * 29} y="162" width="12" height="96" fill="#101f52" />
          <rect x={160 + i * 29} y="162" width="12" height="96" fill={`url(#${id}-hatch-gold)`} opacity="0.7" />
        </g>
      ))}
      <rect x="142" y="258" width="196" height="8" fill="#0d1d4a" stroke="#d4af37" strokeWidth="1" />
      <rect x="132" y="266" width="216" height="8" fill="#0a1638" stroke="#d4af37" strokeWidth="0.8" />
      <rect y="274" width="480" height="46" fill="#040a1c" />
    </SceneFrame>
  );
}

/** Community: the town square at dusk — a ceiba, a kiosk, a bell tower, strung lights. */
function CommunityScene({ className }: SceneProps) {
  const id = 'sc-com';
  return (
    <SceneFrame id={id} tone="#9366e0" deep="#130a26" className={className}>
      <circle cx="96" cy="84" r="60" fill={`url(#${id}-glow)`} className="art-glow" />
      {/* Church with bell tower */}
      <g fill="#1b1036">
        <rect x="300" y="120" width="120" height="150" />
        <path d="M300 120 L360 84 L420 120 Z" />
        <rect x="392" y="60" width="36" height="210" />
        <path d="M392 60 L410 36 L428 60 Z" />
      </g>
      <g fill="none" stroke="#d4af37" strokeWidth="1">
        <path d="M344 270 V222 a16 16 0 0 1 32 0 V270" />
        <circle cx="360" cy="150" r="12" />
        <path d="M402 96 a8 8 0 0 1 16 0 v14 h-16 Z" />
      </g>
      <rect x="406" y="98" width="8" height="10" fill="#f3dc8a" className="art-twinkle" />
      {/* Kiosk */}
      <g>
        <path d="M150 184 L210 150 L270 184 Z" fill="#241547" stroke="#d4af37" strokeWidth="1" />
        <circle cx="210" cy="146" r="3" fill="#d4af37" />
        {[160, 190, 230, 260].map((x) => (
          <rect key={x} x={x - 2} y="184" width="4" height="64" fill="#241547" />
        ))}
        <rect x="150" y="244" width="120" height="10" fill="#241547" stroke="#d4af37" strokeWidth="0.8" />
      </g>
      {/* Ceiba: a buttressed trunk under a wide, tiered canopy */}
      <g fill="#0e0820">
        <path d="M60 270 C 66 236, 62 200, 70 170 L 78 170 C 84 200, 82 236, 92 270 Z" />
        <path d="M60 270 C 50 262, 40 262, 32 270 Z M92 270 C 102 262, 112 262, 120 270 Z" />
        <path d="M72 176 C 50 160, 30 150, 8 146 M76 176 C 96 158, 118 150, 142 146 M74 172 C 72 150, 66 136, 58 124" stroke="#0e0820" strokeWidth="4" fill="none" />
        {[
          [-6, 146, 30, 11], [18, 138, 34, 12], [48, 132, 40, 13], [86, 130, 38, 13], [118, 138, 34, 12], [146, 146, 28, 10],
          [30, 120, 30, 11], [66, 114, 34, 12], [102, 120, 30, 11], [52, 104, 24, 9], [84, 104, 24, 9],
        ].map(([cx, cy, rx, ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <g fill="none" stroke="rgba(212,175,55,0.35)" strokeWidth="0.8">
        <path d="M-20 150 Q30 140 70 146 T 170 150" />
        <path d="M10 124 Q60 112 130 124" />
      </g>
      <path d="M-10 132 Q72 164 150 132" fill="none" stroke="rgba(212,175,55,0.4)" strokeWidth="0.8" />
      {/* Strung lights across the square */}
      <path d="M100 150 Q200 190 300 128" fill="none" stroke="rgba(248,246,241,0.35)" strokeWidth="0.8" />
      {[120, 150, 180, 210, 240, 270].map((x, i) => {
        const t = (x - 100) / 200;
        const y = (1 - t) * (1 - t) * 150 + 2 * (1 - t) * t * 190 + t * t * 128 + 4;
        return (
          <g key={x} className="art-twinkle" style={{ animationDelay: `${i * 0.7}s` }}>
            <circle cx={x} cy={y} r="6" fill={`url(#${id}-glow)`} />
            <circle cx={x} cy={y} r="2.2" fill="#f3dc8a" />
          </g>
        );
      })}
      <rect y="270" width="480" height="50" fill="#0b0618" />
      <rect y="270" width="480" height="50" fill={`url(#${id}-hatch-gold)`} opacity="0.25" />
    </SceneFrame>
  );
}

/** Impact: sky lanterns rising from the water — many small lights, one direction. */
function ImpactScene({ className }: SceneProps) {
  const id = 'sc-imp';
  const random = seeded(31);
  const lanterns = Array.from({ length: 22 }, () => {
    const depth = random();
    return {
      x: r1(40 + random() * 400),
      y: r1(40 + depth * 190),
      s: r1(0.5 + depth * 0.9),
      d: r1(random() * 5),
    };
  }).sort((a, b) => a.s - b.s);
  return (
    <SceneFrame id={id} tone="#d6334f" deep="#1f050b" className={className}>
      <path d={ridge(5, 480, 250, [[90, 70], [300, 50], [430, 80]], 4)} fill="#1a050a" />
      <rect y="250" width="480" height="70" fill="#12030a" />
      <g stroke="#f3dc8a" strokeLinecap="round" opacity="0.55">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={200 - i * 6} x2={280 + i * 6} y1={262 + i * 7} y2={262 + i * 7} strokeWidth="1" opacity={1 - i * 0.1} />
        ))}
      </g>
      {lanterns.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) scale(${l.s})`}>
          <g className="art-float" style={{ animationDelay: `${l.d}s` }}>
            <circle cx="0" cy="4" r="18" fill={`url(#${id}-glow)`} />
            <path d="M-8 -10 Q0 -14 8 -10 L6 12 Q0 14 -6 12 Z" fill="#f0a24a" />
            <path d="M-8 -10 Q0 -14 8 -10 L6 12 Q0 14 -6 12 Z" fill={`url(#${id}-hatch-gold)`} />
            <ellipse cx="0" cy="11" rx="4" ry="2" fill="#fff3c4" />
          </g>
        </g>
      ))}
      {/* Two figures on the shore, releasing the last lantern */}
      <g fill="#0a0105" stroke="rgba(243,220,138,0.5)" strokeWidth="0.6">
        <circle cx="226" cy="214" r="6" />
        <path d="M218 252 L220 228 Q226 220 232 228 L236 252 Z" />
        <path d="M230 230 L240 212" strokeWidth="3" stroke="#0a0105" />
        <circle cx="254" cy="220" r="5" />
        <path d="M247 252 L249 232 Q254 226 259 232 L262 252 Z" />
        <path d="M250 234 L242 214" strokeWidth="2.6" stroke="#0a0105" />
      </g>
      <g transform="translate(241 200)">
        <circle cx="0" cy="0" r="14" fill={`url(#${id}-glow)`} className="art-glow" />
        <path d="M-6 -8 Q0 -11 6 -8 L4.5 8 Q0 10 -4.5 8 Z" fill="#f0a24a" />
      </g>
    </SceneFrame>
  );
}

/** Animals: a quetzal on a branch before the moon, among broad jungle leaves. */
function AnimalsScene({ className }: SceneProps) {
  const id = 'sc-ani';
  const leaf = (x: number, y: number, rotate: number, scale: number, fill: string) => (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0 C 30 -40, 90 -40, 120 0 C 90 40, 30 40, 0 0 Z" fill={fill} />
      <path d="M0 0 H118" stroke="rgba(212,175,55,0.35)" strokeWidth="1" />
      {[20, 40, 60, 80, 100].map((p) => (
        <path key={p} d={`M${p} 0 L${p + 14} -14 M${p} 0 L${p + 14} 14`} stroke="rgba(212,175,55,0.22)" strokeWidth="0.8" />
      ))}
    </g>
  );
  return (
    <SceneFrame id={id} tone="#3f8f4a" deep="#04160a" className={className}>
      <circle cx="300" cy="120" r="120" fill={`url(#${id}-glow)`} className="art-glow" />
      <circle cx="300" cy="120" r="62" fill="#e8c766" />
      <circle cx="300" cy="120" r="62" fill={`url(#${id}-hatch)`} />
      {leaf(-20, 60, 20, 1.2, '#0a2a12')}
      {leaf(380, 280, -150, 1.3, '#0b2f14')}
      {leaf(-10, 300, -30, 1.4, '#082410')}
      {leaf(420, 40, 150, 1, '#0a2a12')}
      {/* Branch */}
      <path d="M60 214 C 180 196, 300 206, 470 186" fill="none" stroke="#1a1208" strokeWidth="9" strokeLinecap="round" />
      <path d="M60 214 C 180 196, 300 206, 470 186" fill="none" stroke="rgba(212,175,55,0.4)" strokeWidth="1" />
      {/* Quetzal: crested head, green body, red breast, long tail */}
      <g transform="translate(250 150)">
        <path d="M-6 58 C 10 110, 0 150, -30 180" fill="none" stroke="#2fa05a" strokeWidth="6" strokeLinecap="round" />
        <path d="M2 58 C 22 110, 20 150, 2 184" fill="none" stroke="#35b064" strokeWidth="5" strokeLinecap="round" />
        <path d="M-2 56 C -30 40, -26 6, 0 -4 C 24 4, 26 40, 8 58 Z" fill="#1f8a4c" />
        <path d="M-2 56 C -30 40, -26 6, 0 -4 C 24 4, 26 40, 8 58 Z" fill={`url(#${id}-hatch-gold)`} opacity="0.6" />
        <path d="M6 18 C 22 24, 20 48, 6 56 C 0 40, 0 28, 6 18 Z" fill="#d6334f" />
        <circle cx="6" cy="-10" r="12" fill="#23995a" />
        <path d="M-4 -18 Q2 -34 12 -20 Q8 -30 18 -18" fill="#2fa05a" />
        <circle cx="10" cy="-12" r="2.4" fill="#0a0a0a" />
        <path d="M16 -8 L24 -6 L16 -3 Z" fill="#e8c766" />
      </g>
    </SceneFrame>
  );
}

const SCENES: Record<DistrictId, (props: SceneProps) => ReactNode> = {
  mercadito: MercaditoScene,
  yavayago: YavayaGoScene,
  work: WorkScene,
  community: CommunityScene,
  impact: ImpactScene,
  animals: AnimalsScene,
};

export function DistrictScene({ id, className }: { id: DistrictId; className?: string }) {
  const Scene = SCENES[id];
  return <Scene className={className} />;
}
