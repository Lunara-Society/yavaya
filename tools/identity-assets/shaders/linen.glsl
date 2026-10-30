// Linen: a woven cloth, close up — warp and weft threads crossing over and
// under, each thread a little uneven (slubs), under soft daylight.
// uC: 0 thread shadow, 1 thread body, 2 thread light.
// uP[0]: x threads per picture height, y contrast, z slubs, w light angle.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 t = c * uP[0].x;
  vec2 cell = floor(t);
  vec2 f = fract(t);
  // Over-under: in alternate cells the warp or the weft is on top.
  float overWarp = mod(cell.x + cell.y, 2.0);
  // Each thread's thickness wavers along it.
  float slubX = uP[0].z * noise(vec2(cell.x * 7.1, t.y * 0.08));
  float slubY = uP[0].z * noise(vec2(t.x * 0.08, cell.y * 7.3));
  float warp = sin(PI * f.x) * (0.85 + 0.3 * slubX);
  float weft = sin(PI * f.y) * (0.85 + 0.3 * slubY);
  float h = overWarp > 0.5 ? warp * (0.6 + 0.4 * sin(PI * f.y)) : weft * (0.6 + 0.4 * sin(PI * f.x));
  float fibre = noise(vec2(t.x * 9.0, t.y * 1.3)) * 0.5 + noise(vec2(t.x * 1.3, t.y * 9.0)) * 0.5;
  float shade = clamp(h * (0.85 + 0.15 * fibre), 0.0, 1.0);

  vec3 color = mix(uC[0], uC[1], mix(1.0, shade, uP[0].y));
  // Soft daylight across the cloth, and slow unevenness of the dye.
  float la = uP[0].w;
  color = mix(color, uC[2], 0.25 * smoothstep(-0.8, 0.8, dot(c, vec2(cos(la), sin(la)))));
  color *= 0.97 + 0.06 * fbm(c * 2.0 + uSeed, 4);
  return color;
}
