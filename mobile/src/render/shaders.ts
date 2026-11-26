/**
 * SYNAPSE shaders (Chapters 04 and 05). SkSL source strings, compiled once by
 * Skia on the GPU. Pure strings so tools/synapse/check-shaders.mjs can compile
 * and render every one off the phone with Skia's own compiler (CanvasKit).
 */

const NOISE = `
float hash(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(float2 p) {
  float2 i = floor(p); float2 f = fract(p); float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}
float fbm(float2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/**
 * The environment (v2, after the owner's first phone test: "all visual stuff
 * seems to be almost non existing"). Still black at heart, but the space now
 * reads at a glance on a phone: a key light with volumetric rays, a slow
 * nebula in the current district's colour, a holographic floor receding to a
 * lit horizon, and three depths of particles that move with the phone.
 */
export const ATMOSPHERE_SKSL = `
uniform float2 size; uniform float time; uniform float3 accent; uniform float accentMix; uniform float2 tilt; uniform float dust; uniform float level;
${NOISE}
float stars(float2 p, float scale, float density, float t, float seed) {
  float2 g = p * scale;
  float2 cell = floor(g); float2 f = fract(g) - 0.5;
  float h = hash(cell + seed);
  float2 o = float2(hash(cell + seed + 3.1), hash(cell + seed + 7.7)) - 0.5;
  float r = length(f - o * 0.7);
  float tw = 0.55 + 0.45 * sin(t * (1.0 + h * 2.0) + h * 40.0);
  return step(1.0 - density, h) * smoothstep(0.09, 0.0, r) * tw;
}
half4 main(float2 xy) {
  float2 uv = xy / size;
  float2 p = (xy - 0.5 * size) / size.y;
  float3 tint = mix(float3(0.42, 0.55, 1.0), accent, accentMix);
  // Base: a deep blue-violet night that falls to true black.
  float3 col = mix(float3(0.030, 0.034, 0.072), float3(0.004, 0.004, 0.010), smoothstep(0.0, 0.85, uv.y));
  // Key light from above, with rays through the haze.
  float2 key = float2(tilt.x * 0.05, -0.78 + tilt.y * 0.03);
  float2 kv = p - key;
  float kd = length(kv);
  float ang = atan(kv.x, kv.y);
  float rays = 0.55 + 0.45 * noise(float2(ang * 9.0, time * 0.08)) * noise(float2(ang * 23.0 - time * 0.05, 1.7));
  float cone = smoothstep(1.15, 0.0, abs(ang) * 1.3) * exp(-kd * 1.25);
  float glow = exp(-kd * kd * 5.0);
  col += tint * (0.30 * cone * rays + 0.22 * glow);
  // Nebula: slow fbm clouds in the district's colour.
  float n = fbm(p * 1.4 + float2(time * 0.012, -time * 0.008) + tilt * 0.04);
  float n2 = fbm(p * 2.6 - float2(time * 0.02, 0.0));
  col += mix(float3(0.35, 0.22, 0.75), tint, 0.6) * smoothstep(0.45, 0.95, n) * 0.16 * (1.0 - uv.y * 0.5);
  col += tint * smoothstep(0.55, 1.0, n2) * 0.05;
  // The holographic floor: a perspective grid receding to a lit horizon.
  float horizon = 0.20 + tilt.y * 0.02;
  if (p.y > horizon) {
    float depth = (p.y - horizon);
    float z = 0.28 / max(depth, 0.004);
    float2 g = float2((p.x + tilt.x * 0.03) * z * 1.6, z + time * 0.35);
    float2 gf = abs(fract(g) - 0.5);
    // Thin lines, strongest near the horizon and fading towards the viewer:
    // a lit table receding into the dark, not a neon floor.
    float w = 0.004 * z + 0.004;
    float aa = 0.010 * z + 0.012;
    float lines = max(smoothstep(w + aa, w, gf.x), smoothstep(w + aa, w, gf.y));
    float fade = smoothstep(0.0, 0.05, depth) * smoothstep(0.30, 0.06, depth) * exp(-z * 0.03);
    col += tint * lines * fade * 0.30;
    col += tint * exp(-depth * 34.0) * 0.38;
  }
  // Particles at three depths; nearer ones move more with the phone.
  if (dust > 0.0) {
    float t = time;
    float s = 0.0;
    s += stars(p + tilt * 0.010 + float2(0.0, t * 0.010), 22.0, 0.22 * dust * 4.0, t, 1.0) * 0.55;
    s += stars(p + tilt * 0.030 + float2(0.0, t * 0.022), 13.0, 0.16 * dust * 4.0, t, 9.0) * 0.85;
    s += stars(p + tilt * 0.060 + float2(0.0, t * 0.040), 7.0, 0.10 * dust * 4.0, t, 21.0) * 1.0;
    col += mix(float3(0.80, 0.86, 1.0), tint, 0.35) * s;
  }
  float v = smoothstep(1.35, 0.30, length(p * float2(0.85, 0.7)));
  return half4(half3(col * v * level), 1.0);
}`;

/**
 * Holographic glass (v2): a dark translucent body the space shows through, an
 * edge that catches the light it faces, an inner glow in the accent when the
 * panel is focused, a lit top edge and a faint scan texture. Text sits on
 * the body, which stays dark enough for every contrast rule (design.test.ts).
 */
export const EDGE_SKSL = `
uniform float2 size; uniform float radius; uniform float2 tilt; uniform float3 accent; uniform float intensity; uniform float focus; uniform float time;
float sdRound(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
half4 main(float2 xy) {
  float2 c = xy - size * 0.5;
  float d = sdRound(c, size * 0.5 - 1.5, radius);
  if (d > 1.5) { return half4(0.0); }
  float inside = smoothstep(1.0, -1.0, d);
  float2 uv = xy / size;
  float3 body = mix(float3(0.060, 0.070, 0.115), float3(0.020, 0.024, 0.042), uv.y);
  float alpha = 0.74 * inside;
  float2 n = normalize(c + float2(0.0001));
  float2 lightDir = normalize(float2(-tilt.x * 1.4, -1.0 + tilt.y * 0.6));
  float facing = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);
  float rim = smoothstep(2.2, 0.0, abs(d + 0.7));
  float3 edgeTint = mix(float3(0.80, 0.86, 1.0), accent, 0.45 + 0.55 * focus);
  float3 edge = edgeTint * rim * (0.30 + 1.10 * facing * facing) * intensity;
  // Inner glow along the edge, in the accent; strong when focused.
  float band = smoothstep(-14.0, -1.0, d) * inside;
  float3 glow = accent * band * (0.06 + 0.22 * focus) * intensity;
  // The top edge is lit from above.
  float top = exp(-pow((xy.y - 1.5) / 2.0, 2.0)) * smoothstep(radius, radius * 2.5, min(xy.x, size.x - xy.x));
  float3 topLight = edgeTint * top * 0.45 * intensity;
  float sheen = exp(-pow((uv.x + uv.y * 0.4 - 0.55 - tilt.x * 0.6) * 4.0, 2.0)) * 0.06 * intensity * inside;
  float scan = (0.5 + 0.5 * sin(xy.y * 1.6 - time * 1.2)) * 0.012 * inside;
  float a = clamp(alpha + rim * intensity * 0.7 + top * 0.3, 0.0, 1.0);
  float3 rgb = body * alpha + edge + glow + topLight + sheen + scan + accent * focus * 0.04 * inside;
  return half4(half3(min(rgb, float3(a))), a);
}`;

/** A district object: a real-time ray-marched faceted crystal and orbit ring, lit and rotatable. */
export const OBJECT_SKSL = `
uniform float2 size; uniform float time; uniform float2 rot; uniform float3 accent; uniform float focus; uniform float quality; uniform float spin;
float3x3 rotY(float a) { float c = cos(a); float s = sin(a); return float3x3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
float3x3 rotX(float a) { float c = cos(a); float s = sin(a); return float3x3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
float sdOct(float3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }
float sdTorus(float3 p, float2 t) { float2 q = float2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float map(float3 p) { return min(sdOct(p, 0.62), sdTorus(rotX(1.1) * p, float2(0.95, 0.016))); }
float3 nrm(float3 p) {
  float e = 0.0015;
  return normalize(float3(map(p + float3(e, 0.0, 0.0)) - map(p - float3(e, 0.0, 0.0)), map(p + float3(0.0, e, 0.0)) - map(p - float3(0.0, e, 0.0)), map(p + float3(0.0, 0.0, e)) - map(p - float3(0.0, 0.0, e))));
}
half4 main(float2 xy) {
  float2 p = (xy - 0.5 * size) / min(size.x, size.y) * 2.0;
  float3 ro = float3(0.0, 0.0, 3.0); float3 rd = normalize(float3(p.x, -p.y, -2.2));
  float3x3 R = rotY(rot.x + time * spin) * rotX(rot.y);
  float t = 0.0; float hit = 0.0; float glow = 0.0;
  for (int i = 0; i < 72; i++) {
    if (float(i) >= quality) { break; }
    float d = map(R * (ro + rd * t));
    glow += exp(-d * 22.0) * 0.018;
    if (d < 0.001) { hit = 1.0; break; }
    t += d;
    if (t > 6.0) { break; }
  }
  float3 col = accent * glow * 0.55;
  float a = clamp(glow * 0.6, 0.0, 1.0);
  if (hit > 0.5) {
    float3 q = R * (ro + rd * t);
    float3 n = nrm(q);
    float3 L = R * normalize(float3(-0.4, 0.8, 0.6));
    float diff = max(dot(n, L), 0.0);
    float rim = pow(1.0 - max(dot(n, -(R * rd)), 0.0), 3.0);
    float3 aq = abs(q);
    float edge = smoothstep(0.03, 0.0, min(min(abs(aq.x - aq.y), abs(aq.y - aq.z)), abs(aq.z - aq.x))) * step(length(q), 0.8);
    col = float3(0.045, 0.05, 0.075) + float3(0.6, 0.65, 0.8) * diff * 0.22 + accent * (rim * 0.85 + edge * (0.45 + 0.4 * focus));
    a = 1.0;
  }
  return half4(half3(min(col, float3(a))), a);
}`;

/**
 * The reconstruction engine (Chapter 05). One program, seven techniques. Each
 * technique defines an ordering field over the surface (who forms first) and
 * how a point looks while it forms. progress 0 = absent, 1 = complete; running
 * progress backwards is the dissolution of the same technique.
 */
export const RECON_SKSL = `
uniform shader content;
uniform float2 size; uniform float progress; uniform float technique; uniform float time; uniform float cell; uniform float2 origin; uniform float3 accent; uniform float layers;
${NOISE}
float local(float field, float p, float width) { return clamp((p * (1.0 + width) - field) / width, 0.0, 1.0); }
float2 voronoi(float2 x) {
  float2 n = floor(x); float2 f = fract(x); float md = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) { for (int i = -1; i <= 1; i++) {
    float2 g = float2(float(i), float(j)); float2 o = float2(hash(n + g), hash(n + g + 19.19));
    float2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; id = hash(n + g + 3.3); }
  } }
  return float2(sqrt(md), id);
}
half4 main(float2 xy) {
  float P = clamp(progress, 0.0, 1.0);
  if (P >= 0.999) { return content.eval(xy); }
  if (P <= 0.001) { return half4(0.0); }
  float2 uv = xy / size;
  float2 o = origin * size;
  float far = length(max(abs(o - float2(0.0)), abs(size - o)));
  float radial = length(xy - o) / max(far, 1.0);
  int T = int(technique + 0.5);
  half4 src = content.eval(xy);
  float appear = 0.0; float glow = 0.0;
  if (T == 0) {
    float2 c = floor(xy / cell); float h = hash(c);
    float l = local(h * 0.6 + radial * 0.4, P, 0.55);
    half4 pt = content.eval((c + 0.5) * cell);
    float2 f = abs(fract(xy / cell) - 0.5);
    float r = mix(0.10, 0.5, l);
    float m = smoothstep(r, r - 0.08, max(f.x, f.y));
    float sharp = smoothstep(0.75, 1.0, l);
    src = mix(pt * m, src, sharp);
    appear = l > 0.0 ? 1.0 : 0.0;
    glow = (1.0 - sharp) * m * l * pt.a * 1.2;
  } else if (T == 1) {
    float row = floor(xy.y / (cell * 2.0));
    float field = uv.y * 0.85 + hash(float2(row, 3.0)) * 0.15;
    float l = local(field, P, 0.18);
    float2 blk = float2(cell * 3.0);
    half4 q = content.eval((floor(xy / blk) + 0.5) * blk);
    float lum = dot(float3(q.rgb), float3(0.3, 0.59, 0.11));
    float sharp = smoothstep(0.55, 1.0, l);
    src = mix(half4(half3(accent * lum * 1.4), q.a), src, sharp);
    appear = step(0.001, l);
    float front = smoothstep(0.035, 0.0, abs(field - P * 1.18 + 0.09));
    float grid = (1.0 - step(0.001, l)) * max(step(fract(xy.x / blk.x), 0.04), step(fract(xy.y / blk.y), 0.04)) * 0.10;
    glow = front * 1.6 + grid;
  } else if (T == 2) {
    float2 v = voronoi(xy / (cell * 9.0));
    float l = local(v.y, P, 0.45);
    float2 dir = float2(cos(v.y * 6.283), sin(v.y * 6.283));
    float2 shift = dir * (1.0 - l) * (1.0 - l) * size.y * 0.12;
    src = content.eval(xy - shift);
    appear = smoothstep(0.0, 0.25, l);
    glow = (1.0 - l) * l * 4.0 * smoothstep(0.06, 0.0, v.x * (1.0 - l) + 0.02) * src.a;
  } else if (T == 3) {
    float l = local(radial, P, 0.65);
    float lum = dot(float3(src.rgb), float3(0.3, 0.59, 0.11));
    float bloom = sin(3.14159 * l);
    src = half4(half3(mix(float3(src.rgb), (accent * 0.6 + float3(0.4)) * (lum + 0.35) * float(src.a), bloom * 0.85)), src.a);
    appear = smoothstep(0.0, 0.5, l);
    glow = bloom * exp(-radial * 2.0) * 0.5 * (1.0 - P);
  } else if (T == 4) {
    float s = cell * 7.0;
    float2 g = float2(xy.x / s + xy.y / (s * 1.732), xy.y / (s * 0.866));
    float2 gi = floor(g); float2 gf = fract(g);
    float upper = step(1.0, gf.x + gf.y);
    float tri = hash(gi + upper * 7.1);
    float l = local(tri * 0.5 + uv.y * 0.5, P, 0.5);
    float edgeDist = min(min(gf.x, gf.y), abs(1.0 - gf.x - gf.y));
    float wire = smoothstep(0.045, 0.0, edgeDist);
    float2 centre = (gi + float2(0.33 + 0.33 * upper)) ;
    half4 facet = content.eval(float2((centre.x - centre.y * 0.5) * s, centre.y * s * 0.866));
    float fill = smoothstep(0.45, 0.8, l);
    float sharp = smoothstep(0.8, 1.0, l);
    src = mix(facet * fill, src, sharp);
    appear = max(fill, wire * step(0.001, l));
    glow = wire * smoothstep(0.0, 0.3, l) * (1.0 - sharp) * 1.3;
  } else if (T == 5) {
    float l = local(radial, P, 0.12);
    float wave = exp(-pow((radial - P * 1.12 + 0.06) * 28.0, 2.0));
    float2 n = normalize(xy - o + float2(0.0001));
    src = content.eval(xy + n * wave * cell * 3.0);
    appear = smoothstep(0.0, 0.6, l);
    glow = wave * 1.4;
  } else {
    float n = fbm(xy / (cell * 14.0) + float2(3.7, 1.3));
    float l = local(n * 0.8 + radial * 0.2, P, 0.12);
    appear = smoothstep(0.0, 1.0, l);
    float band = smoothstep(0.0, 0.5, l) * smoothstep(1.0, 0.5, l);
    float motes = step(0.985, hash(floor(xy / 2.0) + floor(time * 8.0))) * band;
    glow = band * 1.2 + motes * 2.0;
  }
  float3 lightRgb = accent * glow * float(max(src.a, 0.25)) * (0.6 + 0.4 * layers);
  half4 outc = src * half(appear);
  float a = clamp(float(outc.a) + glow * 0.5, 0.0, 1.0);
  return half4(half3(min(float3(outc.rgb) + lightRgb, float3(a))), a);
}`;

/** Awakening: points of light emerging from darkness and resolving into spatial structures. */
export const AWAKEN_SKSL = `
uniform float2 size; uniform float time; uniform float particles; uniform float structures; uniform float3 accent;
${NOISE}
half4 main(float2 xy) {
  float2 p = (xy - 0.5 * size) / size.y;
  float3 col = float3(0.0);
  for (int k = 0; k < 3; k++) {
    float z = 1.0 + float(k) * 0.9;
    float2 g = p * (26.0 + float(k) * 14.0) / z + float2(float(k) * 13.1, time * 0.04 * z);
    float2 c = floor(g); float2 f = fract(g) - 0.5;
    float h = hash(c + float(k) * 7.0);
    float2 off = float2(hash(c + 1.3), hash(c + 5.9)) - 0.5;
    float born = step(h, particles * (0.55 - float(k) * 0.12));
    float r = length(f - off * 0.7);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + h * 50.0);
    col += mix(float3(0.75, 0.82, 1.0), accent, 0.35) * born * smoothstep(0.08 / z, 0.0, r) * tw * (0.9 / z);
  }
  float rr = length(p * float2(1.0, 1.15));
  float ring1 = smoothstep(0.004, 0.0, abs(rr - 0.34)) * smoothstep(-0.2, 1.0, structures);
  float ring2 = smoothstep(0.003, 0.0, abs(rr - 0.52)) * smoothstep(0.2, 1.0, structures);
  float ang = atan(p.y, p.x);
  float arcMask = step(fract(ang / 6.2831 + time * 0.02), structures);
  float spokes = smoothstep(0.004, 0.0, abs(fract(ang / 6.2831 * 24.0) - 0.5) / 24.0 * rr * 6.2831) * step(0.36, rr) * step(rr, 0.5) * structures * 0.5;
  // Halos make the rings read on a phone: thin cores of light inside soft glows.
  float halo1 = exp(-pow((rr - 0.34) * 34.0, 2.0)) * smoothstep(-0.2, 1.0, structures);
  float halo2 = exp(-pow((rr - 0.52) * 46.0, 2.0)) * smoothstep(0.2, 1.0, structures);
  float3 ringLight = float3(0.62, 0.70, 0.95);
  col += ringLight * (ring1 * 1.3 + ring2 * 0.9 + halo1 * 0.32 + halo2 * 0.22) * arcMask + accent * spokes * 0.6;
  // A beam sweeps the rings once as they draw.
  float sweep = exp(-pow(fract(ang / 6.2831 - time * 0.22) * 12.0, 2.0)) * step(rr, 0.56) * structures;
  col += ringLight * sweep * 0.18;
  // The core: light gathering where the Guardian and Roxi will form.
  col += float3(0.55, 0.60, 0.85) * exp(-rr * rr * 7.0) * 0.22 * (structures + particles * 0.5);
  return half4(half3(col), 1.0);
}`;


/**
 * Roxi as a hologram, from her own picture and its depth map. Her figure is
 * cut out of the black by depth and light (no box around her), graded towards
 * her violet, crossed by scanlines and a slow sweep of light, rimmed where her
 * outline meets the dark, and moved with the phone by depth (near parts more).
 * She stands on a projector disc whose light rises around her. `form` builds
 * her from points of light; `level` is her live voice; `state` is what she is
 * doing (0 resting, 1 listening, 2 thinking, 3 speaking).
 */
export const ROXI_HOLO_SKSL = `
uniform shader image;
uniform shader depthMap;
uniform float2 size; uniform float4 box; uniform float time; uniform float level; uniform float state; uniform float form; uniform float2 tilt;
const float3 VIOLET = float3(0.66, 0.50, 1.0);
const float3 CYAN = float3(0.55, 0.85, 1.0);
const float3 GOLD = float3(0.98, 0.84, 0.52);
float hash(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lum(half4 c) { return max(float(c.r), max(float(c.g), float(c.b))); }
float maskAt(float2 q) {
  half4 d = depthMap.eval(q);
  half4 c = image.eval(q);
  return smoothstep(0.03, 0.12, float(d.r)) * smoothstep(0.04, 0.14, lum(c)) * float(c.a);
}
half4 main(float2 xy) {
  float2 local = (xy - box.xy) / box.zw;
  float3 rgb = float3(0.0);
  float alpha = 0.0;
  float pulse = 0.5 + 0.5 * sin(time * 2.2);
  float energy = 0.35 + 0.65 * level + (state > 2.5 ? 0.25 : 0.0) + (state > 0.5 && state < 1.5 ? 0.12 * pulse : 0.0);
  float3 hue = mix(VIOLET, CYAN, state > 1.5 && state < 2.5 ? 0.5 + 0.5 * sin(time * 3.0) : 0.15);

  // The projector: a lit disc under her feet and a cone of light rising from it.
  float2 base = float2(box.x + box.z * 0.5, box.y + box.w * 0.985);
  float2 e = (xy - base) / float2(box.z * 0.42, box.z * 0.075);
  float ring = exp(-pow((length(e) - 1.0) * 6.0, 2.0)) + 0.5 * exp(-dot(e, e) * 1.2);
  float spin = 0.6 + 0.4 * sin(atan(e.y, e.x) * 6.0 + time * 1.6);
  rgb += hue * ring * spin * (0.55 + 0.45 * energy) * smoothstep(1.4, 0.2, length(e) * 0.7);
  float up = clamp((base.y - xy.y) / box.w, 0.0, 1.0);
  float halfWidth = box.z * (0.32 + up * 0.22);
  float beam = smoothstep(halfWidth, halfWidth * 0.2, abs(xy.x - base.x)) * (1.0 - up) * step(xy.y, base.y);
  rgb += hue * beam * 0.10 * (0.6 + 0.4 * energy);

  // Light rising through the beam.
  float2 rg = float2((xy.x - base.x) / halfWidth * 6.0, (xy.y + time * 60.0) / 26.0);
  float2 rc = floor(rg); float2 rf = fract(rg) - 0.5;
  float rh = hash(rc);
  rgb += hue * step(0.86, rh) * smoothstep(0.12, 0.0, length(rf)) * beam * 2.2;

  if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
    float depth = float(depthMap.eval(xy).r);
    float2 q = xy + tilt * (depth - 0.45);
    half4 c = image.eval(q);
    float m = maskAt(q);
    // Rim: where the figure meets the dark.
    float px = 2.5;
    float edge = clamp(abs(m - maskAt(q + float2(px, 0.0))) + abs(m - maskAt(q + float2(0.0, px))) + abs(m - maskAt(q - float2(px, 0.0))), 0.0, 1.0);
    // Materialising: cells arrive from the heart outward as light, then settle.
    float cellSize = 5.0;
    float2 cell = floor(q / cellSize);
    float h = hash(cell);
    float fromHeart = length(local - float2(0.5, 0.38)) * 1.1;
    float arrive = clamp((form * 1.35 - fromHeart * 0.75 - h * 0.35) / 0.25, 0.0, 1.0);
    float spark = (1.0 - abs(arrive * 2.0 - 1.0)) * step(0.001, arrive);
    float3 base3 = float3(c.rgb);
    float l = lum(c);
    float3 holo = mix(base3, hue * (l * 1.25 + 0.06), 0.42);
    // Scanlines, a slow sweep, a rare flicker band.
    float scan = 0.82 + 0.18 * sin(xy.y * 1.9 - time * (6.0 + 8.0 * level));
    float sweepY = fract(time * 0.22) * 1.4 - 0.2;
    float sweep = exp(-pow((local.y - sweepY) * 9.0, 2.0));
    float band = step(0.985, hash(float2(floor(time * 9.0), floor(local.y * 40.0))));
    holo *= scan;
    holo += hue * sweep * 0.35 + hue * band * 0.25;
    holo += hue * edge * (0.9 + 0.8 * energy);
    holo *= 0.92 + 0.22 * energy;
    float a = m * arrive * (0.88 + 0.08 * sin(time * 30.0 + local.y * 6.0) * band);
    float3 sparkCol = mix(hue, GOLD, h) * spark * m * 1.6;
    rgb = rgb * (1.0 - a) + holo * a + sparkCol;
    alpha = max(alpha, a);
  }
  float glowA = clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
  float outA = clamp(max(alpha, glowA), 0.0, 1.0);
  return half4(half3(min(rgb, float3(outA))), outA);
}`;

export const SHADERS = {
  ROXI_HOLO_SKSL, ATMOSPHERE_SKSL, EDGE_SKSL, OBJECT_SKSL, RECON_SKSL, AWAKEN_SKSL } as const;
