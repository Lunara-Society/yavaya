// Marble: a clouded stone crossed by veins. The main veins flow (a sine bent
// by slow noise, with only a little fine wander), swell and thin along their
// length, and carry a soft halo; a second family crosses them more finely,
// and hairlines run between; in metallic marbles the veins catch the light.
// uC: 0 stone deep, 1 stone light, 2 vein halo / clouding, 3 vein core, 4 vein sheen.
// uP[0]: x scale, y vein frequency, z bend, w vein width (thousandths of a wave).
// uP[1]: x angle (radians), y crossing veins, z metallic (0..1), w clouding.

float vein(float t, float width) {
  float v = abs(sin(t));
  float fw = fwidth(v) * 1.2;
  return 1.0 - smoothstep(max(width - fw, 0.0), width + fw, v);
}

vec3 render(vec2 uv, vec2 frag) {
  float a = uP[1].x;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * centred(uv) * uP[0].x + vec2(uSeed * 2.31, uSeed * 1.17);

  // The stone: slow clouds, long drifts of the vein colour, a fine grain.
  float cloud = fbm(p * 0.6 + 3.0, 5);
  vec3 stone = mix(uC[0], uC[1], clamp(0.6 + cloud * uP[1].w * 1.4, 0.0, 1.0));
  float drift = fbm(p * vec2(0.45, 1.3) + 8.0, 5);
  stone = mix(stone, uC[2], smoothstep(0.05, 0.55, drift) * 0.3 * uP[1].w);
  stone *= 0.985 + 0.03 * noise(frag / (uRes.y / 1100.0));

  // Main veins: smooth bends, a little wander, swelling along their length.
  float bend = fbm(p * 0.7, 4) * uP[0].z * 5.0 + fbm(p * 2.8 + 4.0, 3) * 0.3;
  float t = p.x * uP[0].y + bend;
  float swell = 0.4 + 1.2 * smoothstep(-0.45, 0.5, fbm(p * 1.1 + 17.0, 3));
  float width = uP[0].w * 0.001 * swell;
  float core = vein(t, width);
  float halo = 1.0 - smoothstep(width, width * 9.0 + 0.04, abs(sin(t)));

  // Crossing veins, finer, present only here and there.
  float t2 = (p.x * 0.55 + p.y * 0.83) * uP[0].y * 1.9 + fbm(p * 1.3 + 5.0, 4) * uP[0].z * 6.0;
  float there = smoothstep(0.0, 0.35, fbm(p * 0.9 + 7.0, 3)) * uP[1].y;
  float core2 = vein(t2, width * 0.55) * there;
  // Hairlines.
  float t3 = (p.x * -0.7 + p.y * 0.7) * uP[0].y * 3.7 + fbm(p * 2.2 + 9.0, 4) * 4.0;
  float core3 = vein(t3, width * 0.3) * smoothstep(0.1, 0.4, fbm(p * 1.6 + 2.0, 3)) * 0.6;

  vec3 color = mix(stone, uC[2], halo * 0.35);
  color = mix(color, uC[3], clamp(core + core2 * 0.8 + core3 * 0.6, 0.0, 1.0));

  // Metallic veins shimmer: the sheen travels along each vein.
  float sheen = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(t * 0.37 + 4.0 * fbm(p * 0.8 + 2.0, 3)));
  color += uC[4] * uP[1].z * (core * 0.8 + core2 * 0.5) * (0.3 + sheen);
  // A polished slab, lit a little from above.
  color *= 0.94 + 0.1 * smoothstep(-0.6, 0.6, centred(uv).y + 0.2);
  return color * vignette(uv, 0.15);
}
