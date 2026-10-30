// Bokeh: lights out of focus over a soft gradient — large faint discs far
// behind, smaller brighter ones nearer, each with the bright rim a lens gives.
// uC: 0 ground deep, 1 ground glow, 2 light one, 3 light two, 4 light three.
// uP[0]: x disc size, y amount, z sharpness, w ground glow.
// uP[1]: x glow centre x, y glow centre y, z drift (where lights gather, -1..1), w brightness.

vec3 discLayer(vec2 uv, float size, float amount, float soft, float seed) {
  vec2 c = centred(uv);
  vec2 s = c / size;
  vec2 cell = floor(s);
  vec3 sum = vec3(0.0);
  // Neighbouring cells too, so discs may cross cell borders.
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = cell + vec2(float(i), float(j));
      float present = step(1.0 - amount, hash12(id * 1.13 + seed));
      if (present < 0.5) continue;
      vec2 centre = id + 0.5 + 0.8 * (hash22(id + seed) - 0.5);
      float r = 0.35 + 0.45 * hash12(id + seed * 1.7);
      float d = length(s - centre);
      float edgeW = soft * r;
      float disc = 1.0 - smoothstep(r - edgeW, r, d);
      float rim = smoothstep(r - edgeW * 1.6, r - edgeW * 0.4, d) * disc;
      float pick = hash12(id + seed * 5.1);
      vec3 tint = pick < 0.4 ? uC[2] : (pick < 0.75 ? uC[3] : uC[4]);
      float bright = 0.35 + 0.65 * hash12(id + seed * 2.3);
      sum += tint * bright * (disc * 0.32 + rim * 0.32);
    }
  }
  return sum;
}

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 glowAt = vec2(uP[1].x, uP[1].y);
  float glow = exp(-dot(c - glowAt, c - glowAt) * 2.2);
  vec3 color = mix(uC[0], uC[1], glow * uP[0].w);
  // Lights gather toward one side of the picture.
  float gather = smoothstep(-0.9, 0.9, c.x * uP[1].z + 0.25 * fbm(c * 2.0 + uSeed, 3));
  float size = uP[0].x;
  color += discLayer(uv, size * 2.2, uP[0].y * 0.35, 0.65, uSeed + 1.0) * 0.55 * (0.4 + gather);
  color += discLayer(uv, size * 1.3, uP[0].y * 0.45, 0.35 * (1.0 - uP[0].z) + 0.08, uSeed + 2.0) * 0.8 * (0.25 + gather);
  color += discLayer(uv, size * 0.7, uP[0].y * 0.5, 0.18 * (1.0 - uP[0].z) + 0.05, uSeed + 3.0) * (0.15 + gather);
  return color * uP[1].w * vignette(uv, 0.35);
}
