// Aurora: curtains of light sweeping across a night sky full of stars, above
// a low line of dark hills. Each curtain hangs from a long, curving line —
// sharp and brightest at its foot, fading as it rises, faintly combed into
// rays — and changes colour with height.
// uC: 0 sky top, 1 sky horizon, 2 curtain foot, 3 curtain crown, 4 starlight, 5 hills.
// uP[0]: x curtains (1..3), y curtain height, z brightness, w ray fineness.
// uP[1]: x horizon height (0..1), y hills (0 none .. 1), z star density, w sweep.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  float horizon = uP[1].x - 0.5;
  vec3 color = mix(uC[1], uC[0], smoothstep(horizon, 0.5, c.y));

  // Stars, fainter toward the horizon.
  vec2 s = frag / (uRes.y / 300.0);
  vec2 cell = floor(s);
  float star = step(1.0 - 0.16 * uP[1].z, hash12(cell + uSeed)) * smoothstep(0.08, 0.0, length(s - cell - 0.2 - 0.6 * hash22(cell + uSeed)));
  color += uC[4] * star * (0.4 + 0.6 * hash12(cell * 1.9)) * smoothstep(horizon + 0.02, horizon + 0.3, c.y);

  vec3 light = vec3(0.0);
  int count = int(uP[0].x + 0.5);
  for (int i = 0; i < 3; i++) {
    if (i >= count) break;
    float fi = float(i);
    float seed = uSeed * 3.0 + fi * 11.0;
    float base = horizon + 0.15 + fi * 0.08;
    // The curtain's foot: one long sweep across the sky, a slower wander,
    // and the folds of the curtain itself.
    float folds = 0.018 * sin(c.x * 14.0 + 3.0 * fbm(vec2(c.x * 2.0 + seed, 1.0), 3)) + 0.008 * sin(c.x * 37.0 + seed);
    float line = base + uP[1].w * 0.16 * sin(c.x * 1.7 + seed) + 0.05 * fbm(vec2(c.x * 1.2 + seed, seed), 4) + folds;
    float y = c.y - line;
    float height = uP[0].y * (0.75 + 0.5 * smoothstep(-0.4, 0.5, fbm(vec2(c.x * 1.6 + seed * 2.0, 3.0), 3)));
    float foot = smoothstep(-0.006, 0.006, y);
    float body = exp(-max(y, 0.0) / height) * foot;
    float under = exp(-max(-y, 0.0) / 0.01) * (1.0 - foot) * 0.35;
    float rays = 0.62 + 0.38 * smoothstep(-0.6, 0.8, noise(vec2(c.x * uP[0].w + seed * 5.0, 0.3)) + 0.5 * noise(vec2(c.x * uP[0].w * 2.7, 1.7)));
    // The curtain is bright in places and fades away in others.
    float along = smoothstep(-0.25, 0.45, fbm(vec2(c.x * 1.1 + seed * 2.0, 4.0), 3) + 0.1);
    vec3 tint = mix(uC[2], uC[3], smoothstep(0.0, height * 1.4, y));
    light += tint * (body + under) * rays * along * (1.0 - 0.22 * fi);
  }
  color += light * uP[0].z;
  // The sky low down glows faintly with the light above it.
  color += uC[2] * 0.05 * uP[0].z * smoothstep(0.35, 0.0, c.y - horizon);

  // A low line of hills, dark against the glow.
  if (uP[1].y > 0.0) {
    float hill = horizon + uP[1].y * (0.05 * fbm(vec2(c.x * 1.5 + uSeed, 1.0), 5) + 0.02 * fbm(vec2(c.x * 7.0, 2.0), 3) + 0.02);
    float fw = fwidth(c.y) * 1.5;
    float land = 1.0 - smoothstep(hill - fw, hill + fw, c.y);
    vec3 ground = uC[5] + uC[2] * 0.02 * smoothstep(0.03, 0.0, hill - c.y);
    color = mix(color, ground, land);
  }
  return color;
}
