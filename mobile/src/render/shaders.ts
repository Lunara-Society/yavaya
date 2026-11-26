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

/** The environment: absolute black, one soft key light, faint haze, sparse dust. */
export const ATMOSPHERE_SKSL = `
uniform float2 size; uniform float time; uniform float3 accent; uniform float accentMix; uniform float2 tilt; uniform float dust; uniform float level;
${NOISE}
half4 main(float2 xy) {
  float2 uv = xy / size;
  float2 p = (xy - 0.5 * size) / size.y;
  float2 key = float2(0.0, -0.62) + tilt * 0.06;
  float d = length(p - key);
  float light = 0.10 * exp(-d * d * 2.2);
  float haze = noise(p * 1.6 + float2(time * 0.015, time * 0.01)) * 0.03;
  float3 col = float3(0.008, 0.010, 0.020) * (1.0 - uv.y * 0.6) + float3(0.55, 0.62, 0.85) * light + float3(0.30, 0.35, 0.50) * haze;
  col = mix(col, col + accent * light * 0.9, accentMix);
  if (dust > 0.0) {
    float2 g = (p + tilt * 0.02) * 34.0 + float2(0.0, time * 0.12);
    float2 cell = floor(g); float2 f = fract(g) - 0.5;
    float h = hash(cell);
    float2 o = float2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
    float r = length(f - o * 0.6);
    float tw = 0.5 + 0.5 * sin(time * 1.3 + h * 40.0);
    col += float3(0.70, 0.78, 1.0) * step(1.0 - dust, h) * smoothstep(0.06, 0.0, r) * 0.22 * tw;
  }
  float v = smoothstep(1.25, 0.25, length(p * float2(0.9, 0.75)));
  return half4(half3(col * v * level), 1.0);
}`;

/** Holographic glass: a dark translucent body whose edge catches the light it faces. */
export const EDGE_SKSL = `
uniform float2 size; uniform float radius; uniform float2 tilt; uniform float3 accent; uniform float intensity; uniform float focus; uniform float time;
float sdRound(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
half4 main(float2 xy) {
  float2 c = xy - size * 0.5;
  float d = sdRound(c, size * 0.5 - 1.5, radius);
  if (d > 1.5) { return half4(0.0); }
  float inside = smoothstep(1.0, -1.0, d);
  float2 uv = xy / size;
  float3 body = mix(float3(0.075, 0.085, 0.125), float3(0.030, 0.035, 0.055), uv.y);
  float alpha = 0.82 * inside;
  float2 n = normalize(c + float2(0.0001));
  float2 lightDir = normalize(float2(-tilt.x * 1.4, -1.0 + tilt.y * 0.6));
  float facing = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);
  float rim = smoothstep(2.4, 0.0, abs(d + 0.7));
  float3 edgeTint = mix(float3(0.78, 0.84, 1.0), accent, 0.55 + 0.45 * focus);
  float3 edge = edgeTint * rim * (0.16 + 0.84 * facing * facing) * intensity;
  float sheen = exp(-pow((uv.x + uv.y * 0.4 - 0.55 - tilt.x * 0.6) * 4.0, 2.0)) * 0.04 * intensity * inside;
  float a = clamp(alpha + rim * intensity * 0.6, 0.0, 1.0);
  float3 rgb = body * alpha + edge + sheen + accent * focus * 0.05 * inside;
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
  col += float3(0.62, 0.70, 0.92) * (ring1 + ring2 * 0.7) * arcMask * 0.55 + accent * spokes * 0.25;
  col += float3(0.5, 0.56, 0.75) * exp(-rr * rr * 9.0) * 0.06 * structures;
  return half4(half3(col), 1.0);
}`;

export const SHADERS = { ATMOSPHERE_SKSL, EDGE_SKSL, OBJECT_SKSL, RECON_SKSL, AWAKEN_SKSL } as const;
