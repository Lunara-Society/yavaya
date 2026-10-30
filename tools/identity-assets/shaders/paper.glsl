// Paper: a fine sheet under soft light — mottling, long fibres, a gentle
// tooth, and for laid papers the faint lines of the mould.
// uC: 0 shadow, 1 sheet, 2 fibre, 3 light.
// uP[0]: x fibres, y mottling, z tooth, w laid lines (0 none .. 1).
// uP[1]: x light angle, y light amount.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 p = c * 3.0 + uSeed;
  float scale = uRes.y / 2160.0;
  vec3 color = mix(uC[0], uC[1], 0.85 + 0.15 * smoothstep(-0.5, 0.5, fbm(p * 0.8, 5) * uP[0].y * 2.0));
  // Long fibres: thin streaks of noise, each in its own direction.
  float fibres = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = hash12(vec2(float(i), uSeed)) * PI;
    vec2 d = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
    fibres += smoothstep(0.62, 0.9, noise(vec2(d.x * 30.0, d.y * 420.0) + float(i) * 13.0));
  }
  color = mix(color, uC[2], fibres * 0.12 * uP[0].x);
  // Tooth: the fine surface of the sheet.
  float tooth = noise(frag / (2.2 * scale)) * 0.5 + noise(frag / (6.0 * scale)) * 0.5;
  color *= 1.0 - uP[0].z * 0.04 * tooth;
  // Laid lines.
  float laid = 0.5 + 0.5 * sin(c.y * 900.0);
  color *= 1.0 - uP[0].w * 0.025 * laid;
  float la = uP[1].x;
  color = mix(color, uC[3], uP[1].y * 0.3 * smoothstep(-1.0, 1.0, dot(c, vec2(cos(la), sin(la)))));
  return color;
}
