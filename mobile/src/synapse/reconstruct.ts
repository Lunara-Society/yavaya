/**
 * Roxi's reconstruction: the first thing Synapse shows (docs/synapse/ARCHITECTURE.md).
 *
 * One fragment shader draws all of it, so the cost is the same on a cheap phone
 * as on a flagship: per pixel, two looks at the depth map, two at the picture,
 * and some arithmetic. Nothing is computed per particle on the CPU.
 *
 * - She is cut into small cells. Each cell has a moment to arrive, set by how
 *   far it is from her heart, how near it is to the viewer (the depth map), and
 *   a little chance, so she forms from the core outward and never as a wipe.
 * - A cell about to arrive shows as a point of light; while it arrives it grows
 *   from that point, lit violet or gold, and settles into the picture's colour.
 *   An arrived cell is the picture itself at full sharpness.
 * - Before she has formed, light flows in toward her heart from the dark.
 * - Leaving (`dissolve`), cells come apart from the head down and go out.
 * - `tilt` moves the near parts of her more than the far ones (parallax).
 *
 * `progress` is driven by the page actually loading (timeline.ts); it is never
 * a timer. The same source is rendered off the phone by tools/synapse to check
 * every change by eye (docs/synapse/TEST_REPORTS.md).
 */
export const RECONSTRUCT_SKSL = `
uniform shader image;
uniform shader depthMap;
uniform float4 box;       // where her picture sits: x, y, width, height (px)
uniform float2 heart;     // the point she forms from (px)
uniform float cell;       // cell size (px)
uniform float progress;   // 0 nothing .. 1 formed
uniform float dissolve;   // 0 present .. 1 gone
uniform float time;       // seconds, for the light that flows in
uniform float2 tilt;      // parallax at full depth (px)
uniform float motes;      // 0 no inflowing light .. 1 full (quality tier)

const float3 VIOLET = float3(0.62, 0.38, 1.0);
const float3 GOLD = float3(0.96, 0.80, 0.46);
const float ARRIVE = 0.18;   // how much of the progress one cell takes to arrive
const float SPREAD = 0.82;   // arrival moments spread over 0 .. SPREAD, so all have arrived at 1
const float LEAVE = 0.22;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float lum(half4 c) { return max(float(c.r), max(float(c.g), float(c.b))); }

// Light flowing toward her heart: points on a log-polar lattice that slides inward.
float inflow(float2 p, float t) {
  float2 v = p - heart;
  float rad = length(v);
  float ang = atan(v.y, v.x) / 6.2831853 + 0.5;
  float lr = log(rad + 8.0);
  float light = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float2 g = float2(ang * (54.0 + 30.0 * fl), lr * 7.0 + t * (0.55 + 0.25 * fl));
    float2 gi = floor(g);
    float2 gf = fract(g);
    float h = hash(gi + fl * 17.0);
    float2 at = float2(0.5) + (float2(hash(gi + 3.1), hash(gi + 7.7)) - 0.5) * 0.5;
    float dot1 = smoothstep(0.16, 0.0, length(gf - at)) * step(0.82, h);
    light += dot1 * (0.6 + 0.4 * hash(gi + 9.3));
  }
  // Fade near the heart (she is forming there) and at the far edges.
  return light * smoothstep(18.0, 90.0, rad) * (1.0 - smoothstep(box.w * 0.55, box.w * 0.9, rad));
}

half4 main(float2 p) {
  float d0 = depthMap.eval(p).r;
  float2 q = p - tilt * d0;
  float2 rel = (q - box.xy) / cell;
  float2 cid = floor(rel);
  float2 local = rel - cid;
  float2 centre = box.xy + (cid + 0.5) * cell;

  half4 src = image.eval(q);
  // Her picture sits on pure black; the depth map (background pinned to 0) and the
  // light in the picture together say where she is, so only she is drawn.
  float her = max(smoothstep(0.10, 0.24, depthMap.eval(q).r), smoothstep(0.03, 0.10, lum(src)));
  half4 cellColour = image.eval(centre);
  float dc = depthMap.eval(centre).r;
  float r = hash(cid);
  float isHer = step(0.03, dc + lum(cellColour));

  float dist = length(centre - heart) / (length(box.zw) * 0.62);
  float order = clamp(0.58 * dist + 0.30 * r + 0.12 * (1.0 - dc), 0.0, 1.0) * SPREAD;
  float k = clamp((progress - order) / ARRIVE, 0.0, 1.0);

  float top = clamp((centre.y - box.y) / box.w, 0.0, 1.0);
  float leaveAt = clamp(0.55 * top + 0.35 * r + 0.10 * dc, 0.0, 1.0) * (1.0 - LEAVE);
  float gone = clamp((dissolve - leaveAt) / LEAVE, 0.0, 1.0);

  float3 glowColour = mix(VIOLET, GOLD, step(0.62, r));
  float3 col = float3(0.0);
  float alpha = 0.0;

  // The edge distance inside a cell, 0 at its centre and 1 at its border.
  float edge = max(abs(local.x - 0.5), abs(local.y - 0.5)) * 2.0;

  if (k >= 1.0 && gone <= 0.0) {
    col = float3(src.rgb) * her;
    alpha = her;
  } else if (k > 0.0) {
    float size = smoothstep(0.0, 0.85, k) * (1.0 - smoothstep(0.0, 1.0, gone));
    float inside = clamp((size - edge) * cell * 0.5, 0.0, 1.0);
    float settle = smoothstep(0.55, 1.0, k) * (1.0 - gone);
    float3 base = mix(float3(cellColour.rgb), float3(src.rgb), settle);
    float glow = pow(1.0 - k, 1.5) * 1.1 + sin(3.14159 * gone) * 0.9;
    col = (base + glowColour * glow * 0.55) * inside * isHer;
    alpha = max(lum(cellColour), glow * 0.6) * inside * isHer;
  } else {
    // Not yet arrived: a point of light that brightens as its moment nears.
    float near = clamp(1.0 - (order - progress) / 0.16, 0.0, 1.0);
    float pt = smoothstep(0.34, 0.0, edge) * near * near * isHer;
    col = glowColour * pt * 0.9;
    alpha = pt * 0.9;
  }

  // Light flowing in while she forms; none once she has.
  float flow = inflow(p, time) * motes * (1.0 - smoothstep(0.75, 1.0, progress)) * (1.0 - dissolve);
  float3 flowColour = mix(VIOLET, GOLD, 0.35);
  col += flowColour * flow * 0.8;
  // Premultiplied: no channel may exceed the alpha, or the light would overexpose what is under it.
  alpha = clamp(max(alpha, max(col.r, max(col.g, col.b))), 0.0, 1.0);
  col = min(col, float3(alpha));

  return half4(half3(col), half(alpha));
}
`;

/** Her picture (assets/roxi/roxi.webp), in pixels. */
const FIGURE_PX = { width: 720, height: 1544 } as const;
export const FIGURE_ASPECT = FIGURE_PX.width / FIGURE_PX.height;
/** Her heart in the picture, as a fraction of its height (measured: the sternum, 24% down). */
const HEART_Y = 0.25;
const TOP_MARGIN = 0.05;
/** She sits this much of the screen's height above true centre, so her face is in the upper third. */
const LIFT = 0.02;
const HEIGHT_SHARE = 0.86;
const MAX_WIDTH_SHARE = 0.92;
const HALF = 0.5;
/** Cells about 7 dp across: small enough to read as particles, large enough to see each arrive. */
const CELL_DP = 7;
const MIN_CELL_PX = 4;

export type Box = { x: number; y: number; width: number; height: number };

/** Where her picture goes on a screen of this size: as tall as fits, centred, a little above the middle. */
export function figureBox(width: number, height: number): Box {
  let h = height * HEIGHT_SHARE;
  let w = h * FIGURE_ASPECT;
  if (w > width * MAX_WIDTH_SHARE) {
    w = width * MAX_WIDTH_SHARE;
    h = w / FIGURE_ASPECT;
  }
  const y = Math.max(height * TOP_MARGIN, (height - h) * HALF - height * LIFT);
  return { x: (width - w) * HALF, y, width: w, height: h };
}

export function heartOf(box: Box): { x: number; y: number } {
  return { x: box.x + box.width * HALF, y: box.y + box.height * HEART_Y };
}

export function cellSize(pixelRatio: number): number {
  return Math.max(MIN_CELL_PX, Math.round(CELL_DP * pixelRatio));
}
