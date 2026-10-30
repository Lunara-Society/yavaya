// Brushed metal: a plate with fine brushing — straight, or spun in circles
// around a centre — under a broad soft light, with a gentle wave in the
// plate so the reflection bends.
// uC: 0 shadow, 1 body, 2 light, 3 highlight.
// uP[0]: x brush scale, y brush contrast, z light width, w wave.
// uP[1]: x mode (0 straight, 1 spun), y light angle, z spun centre x, w spun centre y.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  float px = uRes.y / 2160.0;
  float brush;
  float along;
  if (uP[1].x > 0.5) {
    vec2 centre = vec2(uP[1].z, uP[1].w);
    vec2 d = c - centre;
    float r = length(d);
    float ang = atan(d.y, d.x);
    // Lathe marks: rings at two scales, read along the radius only.
    brush = noise(vec2(r * 2400.0 / uP[0].x, 0.5)) * 0.55 + noise(vec2(r * 600.0 / uP[0].x, 3.5)) * 0.45;
    // Turned metal catches the light in a bow tie through its centre.
    float bow = pow(abs(cos(ang - uP[1].y)), 5.0);
    vec3 spun = mix(uC[0], uC[1], 0.3 + 0.5 * pow(abs(cos(ang - uP[1].y)), 1.5) + 0.2 * smoothstep(1.2, 0.0, r));
    spun = mix(spun, uC[2], bow * 0.8);
    spun += uC[3] * pow(bow, 14.0) * 0.45;
    spun *= 1.0 + uP[0].y * (brush - 0.5) * 0.6;
    return spun * vignette(uv, 0.2);
  }
  vec2 q = c + vec2(0.0, uP[0].w * 0.04 * sin(c.x * 3.0 + uSeed));
  brush = fbm(vec2(q.x * 3.0, q.y * 900.0 / uP[0].x) + uSeed, 3) * 0.6 + noise(vec2(q.x * 8.0, q.y * 2600.0 / uP[0].x)) * 0.4;
  along = q.x;
  float la = uP[1].y;
  float k = dot(c, vec2(cos(la), sin(la))) + uP[0].w * 0.15 * sin(along * 4.0 + uSeed);
  float band = exp(-pow(k / uP[0].z, 2.0));
  float band2 = exp(-pow((k + 0.55) / (uP[0].z * 1.6), 2.0));
  vec3 color = mix(uC[0], uC[1], smoothstep(-0.9, 0.6, k));
  color = mix(color, uC[2], band * 0.85 + band2 * 0.25);
  color += uC[3] * pow(band, 6.0) * 0.5;
  color *= 1.0 + uP[0].y * (brush * 0.5);
  return color * vignette(uv, 0.2);
}
