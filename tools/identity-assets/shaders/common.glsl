// Shared by every design shader. Prepended by render.mjs; each design adds
// `vec3 render(vec2 uv, vec2 frag)` — uv in [0,1] (y up), frag in pixels —
// returning a LINEAR colour. Encoding to sRGB and dithering happen here, so
// gradients never band and every design is written in light, not in bytes.
precision highp float;
precision highp int;

uniform vec2 uRes;        // the whole image, in pixels
uniform vec2 uOffset;     // where this tile starts
uniform float uSeed;
uniform vec3 uC[6];       // the design's palette, already linear
uniform vec4 uP[4];       // the design's parameters
out vec4 outColor;

const float PI = 3.14159265358979;

// --- hashing and noise ---------------------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// Gradient noise, smooth and isotropic, in [-1, 1].
vec2 grad(vec2 cell) {
  float a = hash12(cell + uSeed * 17.123) * 2.0 * PI;
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i), f);
  float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * noise(p);
    p = ROT * p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}
float fbm(vec2 p) { return fbm(p, 6); }
// Ridged: sharp creases where the noise crosses zero.
float ridged(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * (1.0 - abs(noise(p)));
    p = ROT * p * 2.07 + 5.3;
    amp *= 0.5;
  }
  return sum;
}

// --- colour --------------------------------------------------------------------
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Five-stop ramp over uC[0..4].
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(uC[0], uC[1], t);
  if (t < 2.0) return mix(uC[1], uC[2], t - 1.0);
  if (t < 3.0) return mix(uC[2], uC[3], t - 2.0);
  return mix(uC[3], uC[4], t - 3.0);
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// Colours pass unchanged up to 0.8; above, a smooth shoulder rolls highlights
// towards white instead of clipping them flat.
vec3 tonemap(vec3 c) {
  c = max(c, 0.0);
  vec3 over = max(c - 0.8, 0.0);
  return min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
}
// The aspect-corrected position, centred: x in about [-0.89, 0.89] at 16:9, y in [-0.5, 0.5].
vec2 centred(vec2 uv) { return (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); }
float vignette(vec2 uv, float strength) {
  vec2 d = uv - 0.5;
  return 1.0 - strength * smoothstep(0.25, 0.95, length(d * vec2(1.0, uRes.y / uRes.x * 1.6)));
}
// Anti-aliased line of a scalar field at its integer crossings: width in pixels.
float isoline(float field, float width) {
  float w = fwidth(field) * width;
  float d = abs(fract(field - 0.5) - 0.5);
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(field), d);
}

// A design may compute something once per column first (render.mjs runs
// that pass when the design defines it); the picture itself comes after.
#ifndef COLUMNS_PASS
vec3 render(vec2 uv, vec2 frag);

void main() {
  vec2 frag = gl_FragCoord.xy + uOffset;
  vec2 uv = frag / uRes;
  vec3 color = toSRGB(tonemap(render(uv, frag)));
  // Triangular dither of about one code value: smooth gradients stay smooth in 8 bits.
  float n = hash12(frag + 0.37) + hash12(frag.yx + 7.91) - 1.0;
  outColor = vec4(color + n / 255.0, 1.0);
}
#endif
