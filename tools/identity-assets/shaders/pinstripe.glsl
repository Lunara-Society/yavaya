// Pinstripe: suit cloth — fine stripes on a ground with a faint twill.
// uC: 0 ground, 1 ground lift, 2 stripe, 3 second stripe.
// uP[0]: x stripes per picture width, y stripe width (px at 2160), z twill, w paired stripes (0/1).
// uP[1]: x angle (radians), y light.

float stripe(float v, float width) {
  float px = fwidth(v) + 1e-6;
  float d = abs(fract(v - 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.5 * px, (width * 0.5 + 1.0) * px, d);
}

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  float a = uP[1].x;
  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  float scale = uRes.y / 2160.0;
  float v = p.x * uP[0].x / 1.78;
  // The cloth: a diagonal twill and a slow unevenness of the dye.
  float twill = sin((frag.x + frag.y) / (3.0 * scale)) * 0.5 + 0.5;
  vec3 ground = mix(uC[0], uC[1], 0.5 + 0.5 * fbm(c * 1.5 + uSeed, 4));
  ground *= 1.0 - uP[0].z * 0.05 * twill;
  // Stripes are a little uneven, as woven thread is.
  float w = uP[0].y * scale * (0.9 + 0.2 * noise(vec2(v * 3.0, p.y * 40.0)));
  vec3 color = mix(ground, uC[2], stripe(v, w) * 0.85);
  if (uP[0].w > 0.5) color = mix(color, uC[3], stripe(v + 0.12, w * 0.7) * 0.7);
  color *= 0.94 + 0.1 * uP[1].y * smoothstep(-0.7, 0.7, c.y + c.x * 0.3);
  return color;
}
