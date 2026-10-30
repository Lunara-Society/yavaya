// Horizons: an illustrated landscape of the isthmus — layered ridges and
// volcanoes fading into haze, a sky by the hour with its sun or moon and
// clouds, mist in the valleys, still water mirroring it all, a dark shore in
// the foreground, and on the coasts the silhouettes of palms. Composed so the
// horizon band survives the wide crop of a profile cover.
// uC: 0 sky top, 1 sky at the horizon, 2 sun or moon glow, 3 land near, 4 land far, 5 water.
// uP[0]: x scene, y sun x, z sun height above the horizon, w night (0/1).
//   Scenes: 0 volcano over a lake, 1 twin volcanoes on a lake, 2 coffee hills,
//   3 cloud forest ridges, 4 coast with a headland, 5 islands, 6 crater lake ringed by volcanoes.
// uP[1]: x horizon height (0..1), y haze, z clouds, w star density.
// uP[2]: x rim light, y ridge roughness, z mist, w palms (0/1).

int SCENE;
float YH;

float ridge1(float x, float f, float seed) { return fbm(vec2(x * f + seed, seed * 0.37), 5); }

// A volcano: concave flanks rising to a rounded summit with a shallow crater,
// each side its own width, gullies cut into the slopes.
float cone(float x, float cx, float wl, float wr, float h, float seed) {
  float d = abs(x - cx) / (x < cx ? wl : wr);
  float dd = sqrt(d * d + 0.0016);
  float body = h * pow(max(1.0 - dd, 0.0), 2.1);
  body -= h * 0.025 * smoothstep(0.06, 0.0, d);
  float gullies = noise(vec2(x * 46.0 + seed, seed)) + 0.5 * noise(vec2(x * 130.0 + seed, seed + 1.0));
  body += h * 0.03 * gullies * smoothstep(0.04, 0.5, d) * max(1.0 - d, 0.0);
  return max(body, 0.0);
}

int layerCount() {
  if (SCENE == 3) return 6;
  if (SCENE == 2) return 5;
  if (SCENE == 6) return 4;
  return 3;
}

// Foreground layers stand in front of the water and reach the bottom of the picture.
bool isForeground(int i) {
  if (SCENE == 0 || SCENE == 1 || SCENE == 4 || SCENE == 5) return i == 2 || (SCENE == 4 && i == 1) || (SCENE == 5 && i == 1);
  if (SCENE == 6) return i == 3;
  return false;
}

// A wooded shore rising from one bottom corner: nothing elsewhere, then a
// slope crowned with ragged foliage. `top` is how high it reaches above the horizon.
float shore(float x, float from, float to, float top, float seed) {
  float slope = smoothstep(from, to, x);
  // Rounded like a hill, crowned with tree tops of different sizes.
  float trees = 0.026 * ridged(vec2(x * 22.0 + seed, seed), 3) + 0.01 * noise(vec2(x * 90.0 + seed, 2.0));
  return mix(-0.62, YH + top, pow(slope, 0.42)) + trees * smoothstep(0.02, 0.3, slope);
}

// The top edge of layer i (0 farthest) at x, in centred picture units.
float ridgeRaw(int i, float x) {
  float fi = float(i);
  float rough = uP[2].y;
  float s = uSeed * 1.7 + fi * 13.1;
  if (SCENE == 0) {
    if (i == 0) return YH + 0.006 + 0.025 * ridge1(x, 1.5, s) + cone(x, -0.16 + 0.08 * sin(uSeed), 0.52, 0.66, 0.31, s);
    if (i == 1) return YH + 0.003 + 0.03 * (0.5 + ridge1(x, 2.6, s)) * smoothstep(0.15, 0.8, abs(x + 0.1));
    return shore(x, 0.35, 0.95, 0.03, s);
  }
  if (SCENE == 1) {
    if (i == 0) return YH + 0.006 + 0.018 * ridge1(x, 2.0, s) + max(cone(x, -0.34, 0.42, 0.5, 0.29, s), cone(x, 0.24, 0.36, 0.44, 0.21, s + 3.0));
    if (i == 1) return YH + 0.002 + 0.02 * (0.5 + ridge1(x, 3.0, s)) * smoothstep(0.25, 0.9, abs(x));
    return shore(x, -0.4, -0.95, 0.02, s);
  }
  if (SCENE == 2) {
    // Rolling hills, nearest lowest, a volcano far behind.
    float base = YH + 0.06 - fi * 0.075;
    float amp = 0.05 + fi * 0.02;
    float h = base + amp * (0.5 + ridge1(x, 1.1 + fi * 0.35, s)) * (0.6 + 0.4 * rough);
    if (i == 0) h = max(h, YH + 0.02 + cone(x, 0.3, 0.5, 0.6, 0.22, s));
    return h;
  }
  if (SCENE == 3) {
    float base = YH + 0.1 - fi * 0.075;
    float amp = 0.07 + 0.015 * fi;
    return base + amp * (ridged(vec2(x * (1.3 + 0.25 * fi) + s, s), 5) - 0.45) * (0.8 + 0.6 * rough);
  }
  if (SCENE == 4) {
    // Open sea on one side, a headland rising on the other, a far cape beyond.
    if (i == 0) return YH + 0.002 + 0.02 * smoothstep(0.1, 0.8, -x) * (0.5 + ridge1(x, 2.0, s));
    // The headland: a cliff falling to the sea, its top wooded.
    if (i == 1) {
      float rise = smoothstep(0.02 + 0.03 * noise(vec2(x * 8.0, s)), -0.5, x);
      return mix(-0.62, YH + 0.2 + 0.03 * ridge1(x, 3.0, s), pow(rise, 0.5)) + 0.02 * ridged(vec2(x * 26.0, s), 3) * smoothstep(0.3, 0.8, rise);
    }
    return YH - 0.6;
  }
  if (SCENE == 5) {
    if (i == 0) {
      float isles = max(0.028 * smoothstep(0.16, 0.0, abs(x + 0.05)) * (0.7 + 0.3 * ridge1(x, 6.0, s)), 0.016 * smoothstep(0.1, 0.0, abs(x + 0.5)));
      return YH - 0.001 + isles;
    }
    // A beach in the near right corner, where the palms grow.
    if (i == 1) return mix(-0.62, YH - 0.012, pow(smoothstep(0.3, 0.98, x), 0.7)) + 0.004 * noise(vec2(x * 60.0, s));
    return YH - 0.6;
  }
  // SCENE 6: a crater lake, ringed by volcanoes and hills.
  if (i == 0) return YH + 0.012 + 0.03 * ridge1(x, 1.8, s) + max(cone(x, -0.42, 0.36, 0.42, 0.24, s), cone(x, 0.06, 0.3, 0.36, 0.18, s + 2.0));
  if (i == 1) return YH + 0.006 + 0.055 * smoothstep(0.2, 0.85, x) * (0.6 + ridge1(x, 2.2, s)) + cone(x, 0.62, 0.26, 0.3, 0.12, s + 4.0);
  if (i == 2) return YH + 0.002 + 0.045 * smoothstep(0.25, 0.85, -x) * (0.5 + ridge1(x, 3.0, s));
  return shore(x, 0.4, 0.98, 0.02, s);
}

// The ridge without its fine detail: what mist and shading follow, so a
// spiky ridge never casts streaks down the hillside.
float ridgeSmoothRaw(int i, float x) {
  return (ridgeRaw(i, x - 0.06) + ridgeRaw(i, x - 0.03) + ridgeRaw(i, x) + ridgeRaw(i, x + 0.03) + ridgeRaw(i, x + 0.06)) / 5.0;
}

#ifdef COLUMNS_PASS
// The column pass: every ridge, sharp and smoothed, once per column of the picture.
void main() {
  SCENE = int(uP[0].x + 0.5);
  YH = uP[1].x - 0.5;
  float x = (gl_FragCoord.x - uRes.x * 0.5) / uRes.y;
  int row = int(gl_FragCoord.y);
  if (row == 0) outColor = vec4(ridgeRaw(0, x), ridgeRaw(1, x), ridgeRaw(2, x), ridgeRaw(3, x));
  else if (row == 1) outColor = vec4(ridgeRaw(4, x), ridgeRaw(5, x), ridgeSmoothRaw(0, x), ridgeSmoothRaw(1, x));
  else outColor = vec4(ridgeSmoothRaw(2, x), ridgeSmoothRaw(3, x), ridgeSmoothRaw(4, x), ridgeSmoothRaw(5, x));
}
#else
uniform sampler2D uColumns;

int columnOf(float x) { return clamp(int(floor(x * uRes.y + uRes.x * 0.5)), 0, int(uRes.x) - 1); }
float pick(vec4 v, int k) { return k == 0 ? v.x : (k == 1 ? v.y : (k == 2 ? v.z : v.w)); }
// Read back from the column pass.
float ridgeAt(int i, float x) {
  int col = columnOf(x);
  if (i < 4) return pick(texelFetch(uColumns, ivec2(col, 0), 0), i);
  return pick(texelFetch(uColumns, ivec2(col, 1), 0), i - 4);
}
float ridgeSmooth(int i, float x) {
  int col = columnOf(x);
  if (i < 2) return pick(texelFetch(uColumns, ivec2(col, 1), 0), i + 2);
  return pick(texelFetch(uColumns, ivec2(col, 2), 0), i - 2);
}

bool hasWater() { return SCENE == 0 || SCENE == 1 || SCENE == 4 || SCENE == 5 || SCENE == 6; }

vec3 skyAt(vec2 c, vec2 frag, bool direct) {
  float above = c.y - YH;
  vec3 sky = mix(uC[1], uC[0], smoothstep(0.0, 0.5, above));
  vec2 sun = vec2(uP[0].y, YH + uP[0].z);
  float ds = length(c - sun);
  sky += uC[2] * (exp(-ds * ds * 14.0) * 0.55 + exp(-ds * 4.0) * 0.18);
  // Clouds: long soft bands, lit from the sun's side.
  float band = fbm(vec2(c.x * 1.1 + uSeed, c.y * 6.0), 6);
  float cloud = smoothstep(0.05, 0.45, band) * smoothstep(0.02, 0.12, above) * (1.0 - smoothstep(0.32, 0.5, above)) * uP[1].z;
  float lit = smoothstep(0.9, 0.0, abs(c.x - sun.x));
  vec3 cloudColor = mix(mix(uC[1], uC[0], 0.4) * 0.85, uC[2], 0.35 + 0.5 * lit);
  if (uP[0].w > 0.5) cloudColor = mix(uC[0], uC[1], 0.6) * 1.1 + uC[2] * 0.06 * lit;
  sky = mix(sky, cloudColor, cloud * 0.8);
  if (!direct) return sky;
  if (uP[0].w > 0.5 || uP[1].w > 0.0) {
    // Stars, thinning toward the horizon.
    vec2 s = frag / (uRes.y / 300.0);
    vec2 cell = floor(s);
    float star = step(1.0 - 0.25 * uP[1].w, hash12(cell + uSeed)) * smoothstep(0.09, 0.0, length(s - cell - 0.2 - 0.6 * hash22(cell + uSeed)));
    sky += vec3(0.85, 0.9, 1.0) * star * hash12(cell * 1.7) * smoothstep(0.05, 0.3, above) * (1.0 - cloud);
  }
  // The disc: the sun by day, the moon by night (with its seas).
  float r = uP[0].w > 0.5 ? 0.036 : 0.03;
  float fw = fwidth(ds) * 1.5;
  float disc = 1.0 - smoothstep(r - fw, r + fw, ds);
  vec3 face = uC[2] * 1.6;
  if (uP[0].w > 0.5) face = uC[2] * (1.15 - 0.22 * smoothstep(0.1, 0.5, fbm((c - sun) * 40.0 + 3.0, 4)));
  sky = mix(sky, face, disc * (1.0 - cloud * 0.7) * step(YH, sun.y));
  return sky;
}

// How near a layer stands, 0 (farthest) to 1. On the lakes the volcanoes
// stand in the middle distance, so they keep their shape against the sky.
float depthOf(int i) {
  int count = layerCount();
  if (isForeground(i)) return 1.0;
  if (SCENE == 0 || SCENE == 1) return i == 0 ? 0.5 : 0.72;
  if (SCENE == 6) return i == 0 ? 0.45 : (i == 1 ? 0.6 : 0.75);
  if (SCENE == 4 || SCENE == 5) return 0.3;
  return count > 1 ? float(i) / float(count - 1) : 1.0;
}

vec3 layerColor(int i, vec2 c) {
  float depth = depthOf(i);
  vec3 land = mix(uC[4], uC[3], depth);
  if (isForeground(i)) {
    // Foliage: dark, with leaves catching a little light.
    land = uC[3] * (0.62 + 0.22 * fbm(c * 60.0 + uSeed, 4) + 0.1 * fbm(c * 9.0, 3));
  }
  // Atmosphere: far layers sink toward the colour of the horizon.
  vec3 haze = mix(uC[1], uC[2], 0.12);
  land = mix(land, haze, uP[1].y * pow(1.0 - depth, 1.4) * 0.6);
  float top = ridgeAt(i, c.x);
  float soft = ridgeSmooth(i, c.x);
  float below = soft - c.y;
  // Rim of light along the ridge, toward the sun.
  float rim = smoothstep(0.005, 0.0, top - c.y) * uP[2].x * (0.35 + 0.65 * smoothstep(0.8, 0.0, abs(c.x - uP[0].y)));
  land += uC[2] * rim * 0.45 * (isForeground(i) ? 0.3 : 1.0);
  // Coffee rows on the near hills: lines that follow the slope.
  if (SCENE == 2 && depth > 0.4) land *= 1.0 - 0.12 * smoothstep(0.5, 1.0, sin(below * 420.0 + 2.0 * noise(vec2(c.x * 6.0, float(i)))));
  // Mist rising from the valley under each ridge.
  float mist = exp(-pow((c.y - (soft - 0.085)) * 13.0, 2.0)) * uP[2].z * (1.0 - depth * 0.6);
  if (isForeground(i)) mist = 0.0;
  land = mix(land, haze, clamp(mist, 0.0, 0.7));
  // A little lighter toward each ridge, where the land meets the sky.
  land *= 0.86 + 0.14 * smoothstep(0.14, 0.0, below);
  return land;
}

// Land and sky above the water. `layer` is -1 for sky.
vec3 aboveWater(vec2 c, vec2 frag, bool direct, out int layer) {
  int count = layerCount();
  int nearest = -1;
  for (int i = 0; i < 6; i++) {
    if (i >= count) break;
    if (c.y < ridgeAt(i, c.x)) nearest = i;
  }
  layer = nearest;
  if (nearest < 0) return skyAt(c, frag, direct);
  return layerColor(nearest, c);
}

float sdSegment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// A palm as a silhouette: a curving trunk and feathered, drooping fronds. Returns coverage.
float palm(vec2 c, vec2 base, float height, float lean, float seed) {
  vec2 mn = base - vec2(0.2 * height / 0.3 + abs(lean), 0.02);
  vec2 mx = base + vec2(0.2 * height / 0.3 + abs(lean), height + 0.08);
  if (any(lessThan(c, mn)) || any(greaterThan(c, mx))) return 0.0;
  float px = fwidth(c.y) * 1.2;
  float k = height / 0.3;
  float d = 1e9;
  float h;
  vec2 prev = base;
  for (int j = 1; j <= 10; j++) {
    float t = float(j) / 10.0;
    vec2 q = base + vec2(lean * t * t + 0.12 * lean * sin(t * 3.0), height * t);
    float w = mix(0.0068, 0.0040, t) * k;
    // Rings on the trunk.
    float dist = sdSegment(c, prev, q, h) - w * (0.92 + 0.08 * sin((t - 0.1 + h * 0.1) * 120.0));
    d = min(d, dist);
    prev = q;
  }
  vec2 crown = prev;
  for (int f = 0; f < 9; f++) {
    float a = float(f) / 9.0 * 2.0 * PI + seed;
    vec2 dir = vec2(cos(a), 0.45 * sin(a) + 0.3);
    float len = 0.12 * k * (0.75 + 0.35 * hash12(vec2(float(f), seed)));
    float droop = 0.085 * k * (0.6 + 0.6 * hash12(vec2(seed, float(f))));
    vec2 p0 = crown;
    for (int j = 1; j <= 8; j++) {
      float t1 = float(j) / 8.0;
      vec2 p1 = crown + dir * len * t1 - vec2(0.0, droop * t1 * t1);
      float seg = sdSegment(c, p0, p1, h);
      float tt = (float(j) - 1.0 + h) / 8.0;
      // Leaflets: the frond's edge is cut into a feather.
      float w = 0.0072 * k * pow(1.0 - tt, 0.8) * (0.45 + 0.55 * abs(sin(tt * 26.0 + float(f))));
      d = min(d, seg - w);
      p0 = p1;
    }
  }
  return 1.0 - smoothstep(-px, px, d);
}

vec3 render(vec2 uv, vec2 frag) {
  SCENE = int(uP[0].x + 0.5);
  YH = uP[1].x - 0.5;
  vec2 c = centred(uv);
  int layer;
  vec3 color;
  int count = layerCount();
  // A foreground layer in front of the water?
  int front = -1;
  if (hasWater() && c.y < YH) {
    for (int i = 0; i < 6; i++) {
      if (i >= count) break;
      if (isForeground(i) && c.y < ridgeAt(i, c.x)) front = i;
    }
  }
  if (front >= 0) {
    color = layerColor(front, c);
  } else if (!hasWater() || c.y >= YH) {
    color = aboveWater(c, frag, true, layer);
    // Without water, the nearest layer reaches the bottom of the picture.
    if (!hasWater() && layer < 0 && c.y < YH) color = uC[3];
  } else {
    // Water: the world mirrored, broken by ripples, deepening toward the viewer.
    float depth = YH - c.y;
    float ripple = noise(vec2(c.x * 2.5 + uSeed, 6.0 / (depth + 0.02))) * 0.006 + noise(vec2(c.x * 30.0, 40.0 / (depth + 0.02))) * 0.0025;
    vec2 m = vec2(c.x + ripple, YH + depth * 0.95);
    vec3 mirrored = aboveWater(m, frag, false, layer);
    float fresnel = mix(0.85, 0.45, smoothstep(0.0, 0.35, depth));
    color = mix(uC[5], mirrored, fresnel);
    // Lines of light on the water, and the path of glitter under the sun or moon.
    float lines = smoothstep(0.55, 1.0, noise(vec2(c.x * 4.0 + uSeed, 1.0 / (depth + 0.008) * 0.9)));
    color += uC[1] * lines * 0.05;
    float pathW = 0.02 + depth * 0.45;
    float path = exp(-pow((c.x - uP[0].y) / pathW, 2.0));
    float glint = smoothstep(0.5, 0.95, noise(vec2(c.x * 160.0, 3.0 / (depth + 0.01))));
    float sunUp = smoothstep(-0.02, 0.02, uP[0].z);
    color += uC[2] * path * glint * (0.8 - 0.45 * smoothstep(0.0, 0.4, depth)) * sunUp;
  }
  // Palms, darkest of all, standing on the land they grow from.
  if (uP[2].w > 0.5) {
    float cover = 0.0;
    if (SCENE == 4) {
      cover = max(palm(c, vec2(-0.72, ridgeAt(1, -0.72) - 0.008), 0.24, 0.06, 1.3), palm(c, vec2(-0.58, ridgeAt(1, -0.58) - 0.008), 0.19, 0.09, 2.9));
    } else if (SCENE == 5) {
      cover = max(palm(c, vec2(0.66, ridgeAt(1, 0.66) - 0.006), 0.26, -0.07, 0.7), palm(c, vec2(0.78, ridgeAt(1, 0.78) - 0.006), 0.21, 0.05, 3.3));
    }
    color = mix(color, uC[3] * 0.5, cover);
  }
  return color;
}
#endif
