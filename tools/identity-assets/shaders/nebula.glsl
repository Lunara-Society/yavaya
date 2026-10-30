// Nebula: clouds of glowing gas over deep space, cut by dark dust, with a
// field of stars in three depths — the brightest with a soft glow and a
// faint cross of light.
// uC: 0 space deep, 1 space lift, 2 gas one, 3 gas two, 4 starlight.
// uP[0]: x scale, y gas amount, z dust amount, w star density.
// uP[1]: x cloud centre x, y cloud centre y, z cloud spread, w glow.

float starLayer(vec2 frag, float size, float density, float seed, out float glow) {
  vec2 s = frag / (uRes.y / size);
  vec2 cell = floor(s);
  vec2 centre = cell + 0.15 + 0.7 * hash22(cell + seed);
  float present = step(1.0 - density, hash12(cell * 1.31 + seed));
  float bright = hash12(cell + seed * 3.7);
  float d = length(s - centre);
  glow = present * bright * exp(-d * d * 6.0);
  return present * bright * smoothstep(0.09 + 0.05 * bright, 0.0, d);
}

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 p = c * uP[0].x + vec2(uSeed * 3.1, uSeed * 1.7);
  vec2 centre = vec2(uP[1].x, uP[1].y);
  float region = exp(-dot(c - centre, c - centre) / max(uP[1].z, 0.01));

  vec2 warp = vec2(fbm(p * 0.8, 5), fbm(p * 0.8 + 4.7, 5));
  float gasA = fbm(p * 1.1 + 1.5 * warp, 7);
  float gasB = fbm(p * 1.6 - 1.2 * warp + 9.0, 7);
  float dust = ridged(p * 1.4 + 2.0 * warp + 3.0, 6);

  vec3 color = mix(uC[0], uC[1], smoothstep(-0.7, 0.8, c.y + 0.6 * fbm(p * 0.4, 3)));
  float a = smoothstep(-0.1, 0.6, gasA + 0.35 * region) * uP[0].y * (0.4 + region);
  float b = smoothstep(0.0, 0.7, gasB + 0.3 * region) * uP[0].y * (0.3 + 0.8 * region);
  color += uC[2] * a * 0.9;
  color += uC[3] * b * 0.8;
  // Dust lanes: darker, threaded through the brightest gas.
  color *= clamp(1.0 - uP[0].z * smoothstep(0.55, 0.85, dust) * min(a + b, 1.0), 0.0, 1.0);
  // A soft glow at the heart of the cloud.
  color += mix(uC[2], uC[4], 0.5) * region * region * uP[1].w * 0.35;

  float g1, g2, g3;
  float s1 = starLayer(frag, 520.0, 0.18 * uP[0].w, 1.0, g1);
  float s2 = starLayer(frag, 180.0, 0.07 * uP[0].w, 2.0, g2);
  float s3 = starLayer(frag, 60.0, 0.035 * uP[0].w, 3.0, g3);
  color += uC[4] * (s1 * 0.35 + s2 * 0.8 + s3 * 1.6);
  color += uC[4] * (g2 * 0.15 + g3 * 0.35);
  // The brightest stars: a faint cross of light.
  vec2 s = frag / (uRes.y / 60.0);
  vec2 local = s - floor(s) - (0.15 + 0.7 * hash22(floor(s) + 3.0));
  float cross_ = exp(-abs(local.x) * 60.0) * exp(-abs(local.y) * 4.0) + exp(-abs(local.y) * 60.0) * exp(-abs(local.x) * 4.0);
  color += uC[4] * cross_ * g3 * 0.5;
  return color;
}
